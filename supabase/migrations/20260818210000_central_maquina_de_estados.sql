-- ═══════════════════════════════════════════════════════════════════════════
-- P-10 — A CENTRAL FINANCEIRA: a máquina de estados do título, no BANCO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Contas a Pagar e Contas a Receber ENTRAM dados; nenhum dos dois CONFIRMA.
-- A confirmação e a baixa acontecem na Central, com segregação e alçada — e a
-- máquina de estados precisa morar no BANCO, não só na tela: uma regra que só a
-- tela conhece é uma regra que a importação em lote, a API e o próximo
-- formulário ignoram (a lição do fechamento, ONDA 13).
--
-- ⚠️ **O caminho que MORRE (A4P-052).** Hoje "Registrar pagamento" dá baixa
-- direta, pulando a confirmação. Esta migration proíbe `previsto → baixado`: a
-- baixa só acontece sobre o que a confirmação já autorizou.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. A coluna de situação, com CHECK explícito dos seis estados
-- ───────────────────────────────────────────────────────────────────────────
-- ⚠️ `situacao` é ORTOGONAL ao `status` legado (pago/pendente/cancelado): o
-- status descreve o CAIXA (foi pago?), a situação descreve o CICLO DE CONTROLE
-- (foi confirmado por alguém com alçada?). Um título pode ser status=pendente e
-- situacao=confirmado — autorizado, ainda não pago. Misturar os dois foi o que
-- deixou a baixa pular a confirmação.
alter table public.movements
  add column if not exists situacao text not null default 'previsto'
    check (situacao in ('previsto','confirmado','baixado','conciliado','cancelado','estornado'));

-- ⚠️ Backfill honesto: o que JÁ está pago entra como 'baixado' (a baixa
-- aconteceu, mesmo sem ter passado pela Central que não existia); o cancelado
-- vira 'cancelado'; o resto fica 'previsto'. Não inventamos confirmação
-- retroativa — dizer que um título foi "confirmado" por alguém que nunca
-- confirmou seria a mesma mentira do trial retroativo (Etapa D).
update public.movements set situacao =
  case
    when status = 'pago' then 'baixado'
    when status = 'cancelado' then 'cancelado'
    else 'previsto'
  end
where situacao = 'previsto';

-- Quem CRIOU o título — a outra ponta da segregação. Já existe `origem`
-- (manual/extrato/…); faltava QUEM. `lancado_por` recebe o auth.uid() na
-- inserção pelo DEFAULT; linhas legadas ficam NULL (autor desconhecido) e a
-- segregação não bloqueia sobre elas — não dá para acusar alguém que não
-- registramos.
alter table public.movements
  add column if not exists lancado_por uuid default auth.uid(),
  add column if not exists confirmado_por uuid,
  add column if not exists confirmado_em timestamptz,
  add column if not exists baixado_por uuid,
  add column if not exists baixado_em timestamptz;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. A alçada por papel, configurável por organização
-- ───────────────────────────────────────────────────────────────────────────
-- ⚠️ **A SEED DERIVA DE `role_permissions` — NUNCA de uma lista digitada.**
-- A primeira versão desta migration semeava seis nomes escritos à mão
-- (leitor/lancador/aprovador/fechador/admin/titular) enquanto o gatilho lê
-- `organization_members.role`, que na base real vale owner/admin/member.
-- Resultado medido em produção: `central_teto('owner')` = 0 e **16 dos 17
-- vínculos não confirmavam nada** — inclusive o dono. Só 'admin' funcionava,
-- por coincidência de nome. E `titular` era papel inventado, que não existe
-- nem em `role_permissions` nem no tipo `Papel` do cliente.
--
-- Derivar da tabela canônica mata a classe inteira: papel novo em
-- `role_permissions` nasce com linha de alçada (em 0, que é a direção segura),
-- e seed e gatilho não podem divergir um do outro porque leem a MESMA fonte.
create table if not exists public.central_alcada (
  -- ⚠️ `id` existe para a TRILHA genérica (auditar_escrita lê `->> 'id'`):
  -- mudar quem pode aprovar quanto é exatamente o que uma auditoria pergunta,
  -- então a alçada é uma tabela auditada, não config solta.
  id uuid not null default gen_random_uuid(),
  org_id uuid not null default public.auth_org_id(),
  papel text not null,
  -- ⚠️ **NULL = SEM TETO**, e é diferente de 0 (= nada passa). Um sentinela
  -- tipo 999999999 viraria MEDIDA na primeira tela que o exibisse — a lição do
  -- RUNWAY_CAP (A4P-032): "um teto que não se declara vira medida".
  teto_valor numeric,
  atualizado_em timestamptz not null default now(),
  primary key (org_id, papel)
);
-- Converge a forma antiga (teto_valor era `not null default 0`) sem perder dado.
alter table public.central_alcada alter column teto_valor drop not null;
alter table public.central_alcada enable row level security;

comment on column public.central_alcada.teto_valor is
  'Valor máximo que este papel confirma sozinho. NULL = sem teto (owner/admin). 0 = não confirma nada. Editável por organização.';

-- A trilha da alçada — quem mudou o teto de aprovação de qual papel, e quando.
drop trigger if exists zz_auditar_central_alcada on public.central_alcada;
create trigger zz_auditar_central_alcada
  after insert or update or delete on public.central_alcada
  for each row execute function public.auditar_escrita();

drop policy if exists central_alcada_org on public.central_alcada;
create policy central_alcada_org on public.central_alcada
  for all to authenticated
  using (org_id = public.auth_org_id())
  with check (org_id = public.auth_org_id());

-- ⚠️ Só quem administra mexe na alçada (política restritiva — a permissiva já
-- deixa a org inteira ver; esta TIRA a escrita de quem não administra).
drop policy if exists central_alcada_escrita_admin on public.central_alcada;
create policy central_alcada_escrita_admin on public.central_alcada
  as restrictive for all to authenticated
  using (true)
  with check (public.tem_permissao('administrar'));

-- O PADRÃO de cada papel, num lugar só — consumido pela seed E pelo gatilho.
-- ⚠️ Papel desconhecido cai em 0: papel novo não nasce podendo aprovar.
create or replace function public.central_alcada_padrao(p_papel text)
returns numeric
language sql immutable set search_path = public as $$
  select case p_papel
    when 'owner'     then null::numeric   -- responde pela empresa: sem teto
    when 'admin'     then null::numeric   -- administra e aprova: sem teto
    when 'aprovador' then 10000::numeric  -- o aprovador dedicado (editável por org)
    else 0::numeric                       -- o resto não aprova (role_permissions manda)
  end;
$$;

insert into public.central_alcada (org_id, papel, teto_valor)
select o.id, rp.papel, public.central_alcada_padrao(rp.papel)
from public.organizations o
cross join (select distinct papel from public.role_permissions) rp
on conflict (org_id, papel) do nothing;

-- ⚠️ **ORG NOVA HERDA O PADRÃO — por gatilho, não só pelo seed.** O seed acima
-- cobre as organizações que existiam no dia da migration; uma org criada DEPOIS
-- nasceria sem nenhuma linha de alçada e, pela regra "sem alçada nada é
-- aprovável", ficaria com NADA aprovável até alguém configurar à mão. O padrão
-- editável tem de chegar sozinho — como a assinatura de teste (Etapa D).
create or replace function public.central_alcada_inicial()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.central_alcada (org_id, papel, teto_valor)
  select new.id, rp.papel, public.central_alcada_padrao(rp.papel)
  from (select distinct papel from public.role_permissions) rp
  on conflict (org_id, papel) do nothing;
  return new;
end $$;
revoke all on function public.central_alcada_inicial() from public, anon, authenticated;

drop trigger if exists organizations_central_alcada on public.organizations;
create trigger organizations_central_alcada
  after insert on public.organizations
  for each row execute function public.central_alcada_inicial();

-- O teto para EXIBIR (mensagem de erro, tela de configuração).
-- ⚠️ Devolve NULL quando o papel não tem teto e 0 quando o papel não tem linha.
-- Quem DECIDE é `central_cabe_na_alcada` — um `coalesce(central_teto(...), 0)`
-- distraído transformaria "sem teto" em "fechado".
create or replace function public.central_teto(p_papel text, p_org uuid default null)
returns numeric
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.central_alcada
                  where org_id = coalesce(p_org, public.auth_org_id()) and papel = p_papel)
      then (select teto_valor from public.central_alcada
             where org_id = coalesce(p_org, public.auth_org_id()) and papel = p_papel)
    else 0::numeric
  end;
$$;
revoke all on function public.central_teto(text, uuid) from public, anon;
grant execute on function public.central_teto(text, uuid) to authenticated;

-- A DECISÃO de alçada, encapsulada — sem linha ⇒ false; teto NULL ⇒ true.
create or replace function public.central_cabe_na_alcada(p_papel text, p_valor numeric, p_org uuid default null)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.central_alcada
     where org_id = coalesce(p_org, public.auth_org_id())
       and papel = p_papel
       and (teto_valor is null or abs(p_valor) <= teto_valor)
  );
$$;
revoke all on function public.central_cabe_na_alcada(text, numeric, uuid) from public, anon;
grant execute on function public.central_cabe_na_alcada(text, numeric, uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. A trilha de transições — quem, quando e por quê, por transição
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.central_transicoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org_id(),
  movement_id uuid not null references public.movements(id) on delete cascade,
  de text not null,
  para text not null,
  por uuid not null default auth.uid(),
  motivo text,
  quando timestamptz not null default now()
);
alter table public.central_transicoes enable row level security;
create index if not exists central_transicoes_mov_idx on public.central_transicoes(org_id, movement_id, quando);
-- ⚠️ `central_transicoes` NÃO recebe a trilha de escrita: ela JÁ é uma trilha
-- (registra quem/quando/de/para de cada transição), como own_sync_execucoes e
-- raw_events. Auditar a auditoria é circular. Isenta em scripts/trilha-completa.sql.

drop policy if exists central_transicoes_org on public.central_transicoes;
create policy central_transicoes_org on public.central_transicoes
  for all to authenticated
  using (org_id = public.auth_org_id())
  with check (org_id = public.auth_org_id());

-- ───────────────────────────────────────────────────────────────────────────
-- 4. O gatilho que É a máquina de estados — nenhuma transição fora dela
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.central_transicao_valida(de text, para text)
returns boolean
language sql immutable set search_path = public as $$
  select case de
    when 'previsto'   then para in ('confirmado','cancelado')
    when 'confirmado' then para in ('baixado','cancelado','previsto')
    when 'baixado'    then para in ('conciliado','estornado')
    when 'conciliado' then para in ('estornado')
    else false  -- cancelado e estornado são terminais
  end;
$$;

create or replace function public.central_maquina()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_papel text;
  v_teto numeric;
begin
  -- Só age quando a situação MUDA.
  if new.situacao is not distinct from old.situacao then
    return new;
  end if;

  -- ⚠️ 1. A transição tem de estar na máquina. Tudo que não está é proibido —
  -- não há caminho lateral, e é isto que mata a baixa direta (previsto→baixado).
  if not public.central_transicao_valida(old.situacao, new.situacao) then
    raise exception 'A4P-CENTRAL: transição % → % não é permitida (máquina de estados)',
      old.situacao, new.situacao
      using hint = 'Um título previsto precisa ser CONFIRMADO antes de ser baixado.';
  end if;

  -- ⚠️ 2. CONFIRMAR (previsto→confirmado) exige segregação, PERMISSÃO e alçada.
  if old.situacao = 'previsto' and new.situacao = 'confirmado' then
    -- R1: quem lançou não confirma o próprio. `lancado_por` é quem inseriu.
    if new.lancado_por is not null and new.lancado_por = auth.uid() then
      raise exception 'A4P-CENTRAL-SEGREGACAO: quem lançou não pode confirmar o próprio título'
        using hint = 'Outra pessoa precisa confirmar este lançamento.';
    end if;

    select role into v_papel from public.organization_members
      where user_id = auth.uid() and org_id = new.org_id limit 1;

    -- ⚠️ **QUEM APROVA sai de `role_permissions`, não da alçada.** Uma fonte só,
    -- e ela é completa por construção (é a matriz que `tem_permissao` lê). A
    -- alçada responde outra pergunta: QUANTO. Misturar as duas foi o que deixou
    -- o `fechador` com teto de 50.000 sem ter a ação `aprovar`.
    if not public.tem_permissao('aprovar', new.org_id) then
      raise exception 'A4P-CENTRAL-PERMISSAO: o papel % não pode confirmar títulos', coalesce(v_papel, 'sem papel')
        using hint = 'Peça a um Aprovador, Administrador ou Titular. Isto se resolve mudando o PAPEL, não a alçada.';
    end if;

    -- ⚠️ As duas recusas têm mensagem DIFERENTE de propósito: "você não pode
    -- aprovar" e "o valor não cabe na sua alçada" se resolvem de jeitos
    -- opostos, e uma mensagem genérica vira chamado de suporte.
    if not public.central_cabe_na_alcada(coalesce(v_papel, 'leitor'), new.amount, new.org_id) then
      v_teto := public.central_teto(coalesce(v_papel, 'leitor'), new.org_id);
      raise exception 'A4P-CENTRAL-ALCADA: valor % acima da alçada do papel % (teto %)',
        new.amount, coalesce(v_papel, 'sem papel'), v_teto
        using hint = 'Um papel com alçada maior precisa confirmar, ou a alçada deste papel pode ser aumentada nas configurações.';
    end if;

    new.confirmado_por := auth.uid();
    new.confirmado_em := now();
  end if;

  -- 3. BAIXAR carimba quem baixou.
  if new.situacao = 'baixado' then
    new.baixado_por := coalesce(new.baixado_por, auth.uid());
    new.baixado_em := coalesce(new.baixado_em, now());
  end if;

  -- 4. A transição fica na trilha, sempre.
  insert into public.central_transicoes (org_id, movement_id, de, para, por)
  values (new.org_id, new.id, old.situacao, new.situacao, coalesce(auth.uid(), new.lancado_por));

  return new;
end $$;

drop trigger if exists central_maquina_trg on public.movements;
create trigger central_maquina_trg
  before update of situacao on public.movements
  for each row execute function public.central_maquina();

comment on function public.central_maquina() is
  'A máquina de estados do título (P-10). Nenhuma transição de situacao acontece fora dela; confirmar exige segregação (R1), a ação aprovar em role_permissions e alçada de valor; cada transição vai para central_transicoes.';
