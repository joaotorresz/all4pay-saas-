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
-- ⚠️ SEM alçada configurada, NADA é aprovável — a função devolve 0 para papel
-- não declarado, nunca infinito. É a direção segura.
create table if not exists public.central_alcada (
  org_id uuid not null default public.auth_org_id(),
  papel text not null,
  teto_valor numeric not null default 0,
  atualizado_em timestamptz not null default now(),
  primary key (org_id, papel)
);
alter table public.central_alcada enable row level security;

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

-- Os PADRÕES editáveis (o joão pediu "padrão + você ajusta"). Semeados por
-- organização; a tela sobrescreve.
insert into public.central_alcada (org_id, papel, teto_valor)
select o.id, v.papel, v.teto
from public.organizations o
cross join (values
  ('leitor', 0), ('lancador', 0),
  ('aprovador', 5000), ('fechador', 50000),
  ('admin', 999999999), ('titular', 999999999)
) as v(papel, teto)
on conflict (org_id, papel) do nothing;

create or replace function public.central_teto(p_papel text)
returns numeric
language sql stable security definer set search_path = public as $$
  -- Papel não declarado ⇒ 0. Ausência é fechada.
  select coalesce(
    (select teto_valor from public.central_alcada
      where org_id = public.auth_org_id() and papel = p_papel), 0);
$$;
revoke all on function public.central_teto(text) from public, anon;
grant execute on function public.central_teto(text) to authenticated;

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

  -- ⚠️ 2. CONFIRMAR (previsto→confirmado) exige alçada E segregação.
  if old.situacao = 'previsto' and new.situacao = 'confirmado' then
    -- R1: quem lançou não confirma o próprio. `lancado_por` é quem inseriu.
    if new.lancado_por is not null and new.lancado_por = auth.uid() then
      raise exception 'A4P-CENTRAL: quem lançou não pode confirmar o próprio título (segregação de funções)'
        using hint = 'Outra pessoa precisa confirmar este lançamento.';
    end if;
    -- Alçada: o valor tem de caber no teto do papel de quem confirma.
    select role into v_papel from public.organization_members
      where user_id = auth.uid() and org_id = new.org_id limit 1;
    v_teto := public.central_teto(coalesce(v_papel, 'leitor'));
    if abs(new.amount) > v_teto then
      raise exception 'A4P-CENTRAL: valor % acima da alçada do papel % (teto %)',
        new.amount, coalesce(v_papel, 'leitor'), v_teto
        using hint = 'Este título sobe para um papel com alçada maior.';
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
  'A máquina de estados do título (P-10). Nenhuma transição de situacao acontece fora dela; confirmar exige alçada e segregação (R1); cada transição vai para central_transicoes.';
