-- ═══════════════════════════════════════════════════════════════════════════
-- WHATSAPP PARA CLIENTES — autorização registrada e pedido de saída (etapa 5)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Decisão do dono (15/10/2026): cliente SEM autorização registrada não recebe
-- WhatsApp; a cobrança dele segue por e-mail. A empresa pode marcar em lote os
-- clientes que já autorizaram. Quem pede para sair deixa de receber em QUALQUER
-- caso, de qualquer empresa.
--
--   1. `telefone_canonico(text)` — a MESMA forma de `destinoCanonico` no
--      núcleo: só dígitos, sem o 55 do país. Sem ela "+55 11 98888-7777" e
--      "(11) 98888-7777" seriam duas pessoas, e a saída de uma não alcançaria
--      a outra.
--   2. `whatsapp_autorizacoes` — por EMPRESA: este telefone autorizou ESTA
--      empresa a mandar mensagem, com data, forma e evidência. Escrita só
--      pelas RPCs (o telefone sai do CADASTRO do contato, nunca do pedido).
--   3. `whatsapp_saidas` — da PLATAFORMA: o número da Twilio é um só para
--      todas as empresas, e quem responde SAIR a ele não sabe de que empresa
--      era a mensagem. A saída vale para todas.
--   4. As RPCs: autorizar e revogar (em lote), a situação dos contatos da
--      empresa, o registro da saída (só o webhook) e as saídas entre uma lista
--      de telefones (só os executores).
--   5. `automacao_contexto` passa a levar a situação de WhatsApp de cada
--      contato — a régua automática decide com ela.
--
-- ⚠️ **MUDA QUEM PODE CHAMAR O QUÊ** — declarado aqui e no PR:
--   · authenticated GANHA `whatsapp_autorizar`, `whatsapp_revogar` e
--     `whatsapp_situacao_contatos` (SECURITY DEFINER, recortadas pela empresa
--     ATIVA e por `tem_permissao`: autorizar e revogar pedem quem lança, dá
--     baixa ou administra — o mesmo recorte da rota de cobrança);
--   · service_role GANHA `whatsapp_registrar_saida` (o webhook da Twilio, depois
--     da assinatura) e `whatsapp_saidas_entre` (os executores);
--   · ninguém escreve nas duas tabelas por fora das RPCs.
--
-- ⚠️ A autorização NÃO é inferida de nada: nem do telefone cadastrado, nem de
-- uma mensagem antiga. Marcar "autorizou" sem evidência seria afirmar uma
-- escolha que ninguém fez — a mesma regra da competência dos lançamentos
-- antigos. Por isso a evidência é obrigatória (como e quando o cliente
-- autorizou), e o registro guarda quem marcou.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. O TELEFONE CANÔNICO
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.telefone_canonico(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(
    case when length(d) >= 12 and d like '55%' then substr(d, 3) else d end, '')
    from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x
$$;

comment on function public.telefone_canonico(text) is
  'Só dígitos, sem o 55 do país (12+ dígitos começando por 55). Espelho de destinoCanonico em core/automacoes.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. A AUTORIZAÇÃO — por empresa
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.whatsapp_autorizacoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  telefone text not null check (telefone ~ '^\d{10,13}$'),
  party_id uuid references public.parties(id) on delete set null,
  -- declarada = alguém da empresa registrou que o cliente autorizou;
  -- resposta  = o próprio cliente respondeu VOLTAR / QUERO RECEBER.
  forma text not null check (forma in ('declarada', 'resposta')),
  evidencia text not null check (length(btrim(evidencia)) between 10 and 500),
  registrado_por uuid default auth.uid(),
  registrado_em timestamptz not null default now(),
  revogado_em timestamptz,
  revogado_por uuid
);
alter table public.whatsapp_autorizacoes enable row level security;

-- Uma autorização VIVA por telefone e empresa. A revogada fica (é histórico).
create unique index if not exists whatsapp_autorizacoes_viva
  on public.whatsapp_autorizacoes (org_id, telefone) where revogado_em is null;

comment on table public.whatsapp_autorizacoes is
  'Autorização do cliente para receber WhatsApp DESTA empresa. Sem linha viva, a régua usa e-mail. Escrita só por whatsapp_autorizar/whatsapp_revogar.';

drop trigger if exists zz_auditar_whatsapp_autorizacoes on public.whatsapp_autorizacoes;
create trigger zz_auditar_whatsapp_autorizacoes
  after insert or update or delete on public.whatsapp_autorizacoes
  for each row execute function public.auditar_escrita();

revoke all on public.whatsapp_autorizacoes from public, anon, authenticated, service_role;
grant select on public.whatsapp_autorizacoes to authenticated, service_role;

drop policy if exists whatsapp_autorizacoes_org on public.whatsapp_autorizacoes;
create policy whatsapp_autorizacoes_org on public.whatsapp_autorizacoes
  for select to authenticated
  using (org_id = public.auth_org_id());

-- ───────────────────────────────────────────────────────────────────────────
-- 3. A SAÍDA — da plataforma
-- ───────────────────────────────────────────────────────────────────────────
-- Sem `org_id`, de propósito: o pedido chega ao número da plataforma e vale
-- para todas as empresas. Por isso fica fora da guarda `trilha-completa`
-- (que só cobra tabela com `org_id`); o rastro é a própria tabela, que nunca
-- apaga: voltar carimba `voltou_em`, e sair de novo é outra linha.
create table if not exists public.whatsapp_saidas (
  id uuid primary key default gen_random_uuid(),
  telefone text not null check (telefone ~ '^\d{10,13}$'),
  saiu_em timestamptz not null default now(),
  voltou_em timestamptz,
  -- O texto que a pessoa mandou (cortado), para quem audita entender o pedido.
  origem text check (origem is null or length(origem) <= 200)
);
alter table public.whatsapp_saidas enable row level security;

create unique index if not exists whatsapp_saidas_viva
  on public.whatsapp_saidas (telefone) where voltou_em is null;

comment on table public.whatsapp_saidas is
  'Quem respondeu SAIR ao número da plataforma. Bloqueia TODO WhatsApp para o telefone, de qualquer empresa, até a própria pessoa responder VOLTAR.';

-- Nenhuma política: só as funções SECURITY DEFINER leem e escrevem.
revoke all on public.whatsapp_saidas from public, anon, authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. AS PORTAS
-- ───────────────────────────────────────────────────────────────────────────

-- 4a. Autorizar (um ou vários contatos). O telefone vem do CADASTRO: quem
-- chama escolhe contatos da própria empresa, nunca um número solto — senão a
-- autorização viraria o caminho para usar o número da plataforma de megafone.
create or replace function public.whatsapp_autorizar(p_partes uuid[], p_evidencia text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_org uuid := public.auth_org_id();
  v_ev text := btrim(coalesce(p_evidencia, ''));
  r record;
  n_ok int := 0; n_ja int := 0; n_sem int := 0; n_saiu int := 0; n_fora int := 0;
begin
  if v_org is null then raise exception 'Entre numa empresa para registrar autorizações.'; end if;
  if not (public.tem_permissao('lancar', v_org) or public.tem_permissao('baixar', v_org)
          or public.tem_permissao('administrar', v_org)) then
    raise exception using errcode = '42501',
      message = 'Seu papel nesta empresa não registra autorização de WhatsApp.';
  end if;
  if length(v_ev) < 10 then
    raise exception using errcode = '22023',
      message = 'Diga como o cliente autorizou (ex.: "assinou o contrato com a cláusula de WhatsApp em 10/10").';
  end if;
  if p_partes is null or cardinality(p_partes) = 0 then
    return jsonb_build_object('autorizados', 0, 'jaAutorizados', 0, 'semTelefone', 0, 'pediramSaida', 0, 'foraDaEmpresa', 0);
  end if;
  if cardinality(p_partes) > 1000 then
    raise exception using errcode = '22023', message = 'No máximo 1.000 contatos por vez.';
  end if;

  select count(*) into n_fora
    from unnest(p_partes) u(id)
   where not exists (select 1 from public.parties p
                      where p.id = u.id and p.org_id = v_org and p.excluido_em is null);

  for r in
    select distinct on (public.telefone_canonico(p.phone)) p.id, public.telefone_canonico(p.phone) as tel
      from public.parties p
     where p.id = any (p_partes) and p.org_id = v_org and p.excluido_em is null
     order by public.telefone_canonico(p.phone), p.id
  loop
    if r.tel is null or r.tel !~ '^\d{10,13}$' then n_sem := n_sem + 1; continue; end if;
    if exists (select 1 from public.whatsapp_saidas s where s.telefone = r.tel and s.voltou_em is null) then
      n_saiu := n_saiu + 1; continue;
    end if;
    if exists (select 1 from public.whatsapp_autorizacoes a
                where a.org_id = v_org and a.telefone = r.tel and a.revogado_em is null) then
      n_ja := n_ja + 1; continue;
    end if;
    insert into public.whatsapp_autorizacoes (org_id, telefone, party_id, forma, evidencia)
    values (v_org, r.tel, r.id, 'declarada', left(v_ev, 500));
    n_ok := n_ok + 1;
  end loop;

  return jsonb_build_object('autorizados', n_ok, 'jaAutorizados', n_ja, 'semTelefone', n_sem,
                            'pediramSaida', n_saiu, 'foraDaEmpresa', n_fora);
end $$;

-- 4b. Revogar (a empresa deixa de considerar o cliente autorizado).
create or replace function public.whatsapp_revogar(p_partes uuid[])
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_org uuid := public.auth_org_id();
  n int;
begin
  if v_org is null then raise exception 'Entre numa empresa para revogar autorizações.'; end if;
  if not (public.tem_permissao('lancar', v_org) or public.tem_permissao('baixar', v_org)
          or public.tem_permissao('administrar', v_org)) then
    raise exception using errcode = '42501',
      message = 'Seu papel nesta empresa não altera autorização de WhatsApp.';
  end if;
  update public.whatsapp_autorizacoes a
     set revogado_em = now(), revogado_por = auth.uid()
   where a.org_id = v_org and a.revogado_em is null
     and a.telefone in (select public.telefone_canonico(p.phone) from public.parties p
                         where p.id = any (coalesce(p_partes, '{}')) and p.org_id = v_org);
  get diagnostics n = row_count;
  return n;
end $$;

-- 4c. A situação de cada contato da empresa ATIVA (a tela e a rota manual).
-- ⚠️ A saída é da plataforma, mas só aparece aqui para telefones que JÁ são
-- contatos desta empresa: a empresa não enumera quem saiu do número inteiro.
create or replace function public.whatsapp_situacao_contatos()
returns table (party_id uuid, telefone text, autorizado boolean, autorizado_em timestamptz,
               forma text, evidencia text, saiu boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
         public.telefone_canonico(p.phone),
         a.id is not null,
         a.registrado_em,
         a.forma,
         a.evidencia,
         exists (select 1 from public.whatsapp_saidas s
                  where s.telefone = public.telefone_canonico(p.phone) and s.voltou_em is null)
    from public.parties p
    left join public.whatsapp_autorizacoes a
      on a.org_id = p.org_id and a.telefone = public.telefone_canonico(p.phone) and a.revogado_em is null
   where p.org_id = public.auth_org_id() and p.excluido_em is null
     and public.telefone_canonico(p.phone) is not null
$$;

-- 4d. O registro da saída — SÓ o webhook (depois da assinatura da Twilio).
create or replace function public.whatsapp_registrar_saida(p_telefone text, p_acao text, p_origem text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_tel text := public.telefone_canonico(p_telefone);
  n int;
begin
  if v_tel is null or v_tel !~ '^\d{10,13}$' then
    raise exception using errcode = '22023', message = 'telefone inválido';
  end if;
  if p_acao = 'sair' then
    insert into public.whatsapp_saidas (telefone, origem)
    values (v_tel, left(p_origem, 200))
    on conflict (telefone) where voltou_em is null do nothing;
    get diagnostics n = row_count;
    return jsonb_build_object('acao', 'sair', 'mudou', n > 0);
  elsif p_acao = 'voltar' then
    update public.whatsapp_saidas set voltou_em = now()
     where telefone = v_tel and voltou_em is null;
    get diagnostics n = row_count;
    return jsonb_build_object('acao', 'voltar', 'mudou', n > 0);
  end if;
  raise exception using errcode = '22023', message = 'ação deve ser sair ou voltar';
end $$;

-- 4e. Quem, entre estes telefones, pediu para sair — os executores perguntam
-- antes de mandar QUALQUER WhatsApp (régua, automações da empresa, fluxos).
create or replace function public.whatsapp_saidas_entre(p_telefones text[])
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct s.telefone), '{}')
    from public.whatsapp_saidas s
   where s.voltou_em is null
     and s.telefone in (select public.telefone_canonico(t) from unnest(coalesce(p_telefones, '{}')) t)
$$;

revoke all on function public.telefone_canonico(text) from public, anon;
grant execute on function public.telefone_canonico(text) to authenticated, service_role;
revoke all on function public.whatsapp_autorizar(uuid[], text) from public, anon, service_role;
revoke all on function public.whatsapp_revogar(uuid[]) from public, anon, service_role;
revoke all on function public.whatsapp_situacao_contatos() from public, anon, service_role;
grant execute on function public.whatsapp_autorizar(uuid[], text) to authenticated;
grant execute on function public.whatsapp_revogar(uuid[]) to authenticated;
grant execute on function public.whatsapp_situacao_contatos() to authenticated;
revoke all on function public.whatsapp_registrar_saida(text, text, text) from public, anon, authenticated;
revoke all on function public.whatsapp_saidas_entre(text[]) from public, anon, authenticated;
grant execute on function public.whatsapp_registrar_saida(text, text, text) to service_role;
grant execute on function public.whatsapp_saidas_entre(text[]) to service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. O CONTEXTO DA RÉGUA LEVA A SITUAÇÃO DE WHATSAPP
-- ───────────────────────────────────────────────────────────────────────────
-- A função inteira de `20260930190000`, com UMA chave a mais em cada parte:
-- `whatsapp` = 'autorizado' | 'saiu' | 'sem_autorizacao'. ⚠️ A saída vence a
-- autorização (quem saiu não recebe, mesmo autorizado). O núcleo lê ausência
-- da chave como `sem_autorizacao`: um banco sem esta migration não manda
-- WhatsApp a cliente nenhum (falha fechada).
create or replace function public.automacao_contexto(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
  n_mov bigint;
begin
  if p_org is null or not exists (select 1 from public.organizations where id = p_org) then
    raise exception 'automacao_contexto: a organização % não existe', p_org;
  end if;

  select count(*) into n_mov
    from public.movements m
   where m.org_id = p_org and not m.is_sample and m.excluido_em is null;

  select jsonb_build_object(
    'org', (select jsonb_build_object('id', o.id, 'nome', o.name)
              from public.organizations o where o.id = p_org),
    'perfil', (select cp.profile -> 'db' from public.company_profiles cp
                where cp.org_id = p_org limit 1),
    'contas', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'nome', a.name, 'saldo', a.balance) order by a.name)
        from public.financial_accounts a
       where a.org_id = p_org and a.excluido_em is null), '[]'::jsonb),
    'movimentos', coalesce((
      select jsonb_agg(to_jsonb(x))
        from (
          select m.id, m.account_id, m.type, m.status, m.situacao, m.amount,
                 m.due_date, m.paid_date, m.competence_date, m.description,
                 m.party_id, m.category, m.origem, m.reference_code,
                 m.installment_no, m.installment_total,
                 c.name as categoria, cc.name as centro, p.name as projeto
            from public.movements m
            left join public.categories   c  on c.id  = m.category_id
            left join public.cost_centers cc on cc.id = m.cost_center_id
            left join public.projects     p  on p.id  = m.project_id
           where m.org_id = p_org and not m.is_sample and m.excluido_em is null
           order by m.due_date desc nulls last
           limit 5000
        ) x), '[]'::jsonb),
    'truncado', n_mov > 5000,
    'partes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', pt.id, 'nome', pt.name, 'telefone', pt.phone, 'email', pt.email,
               'whatsapp', case
                 when pt.tel is null then 'sem_autorizacao'
                 when exists (select 1 from public.whatsapp_saidas s
                               where s.telefone = pt.tel and s.voltou_em is null) then 'saiu'
                 when exists (select 1 from public.whatsapp_autorizacoes wa
                               where wa.org_id = p_org and wa.telefone = pt.tel and wa.revogado_em is null) then 'autorizado'
                 else 'sem_autorizacao' end))
        from (select pa.*, public.telefone_canonico(pa.phone) as tel
                from public.parties pa
               where pa.org_id = p_org and pa.excluido_em is null
               order by pa.name limit 5000) pt), '[]'::jsonb),
    'membros', coalesce((
      select jsonb_agg(jsonb_build_object(
               'userId', om.user_id, 'papel', om.role,
               'nome', coalesce(nullif(om.display_name, ''), u.raw_user_meta_data ->> 'name'),
               'email', coalesce(nullif(om.email, ''), u.email)))
        from public.organization_members om
        left join auth.users u on u.id = om.user_id
       where om.org_id = p_org and om.role in ('owner', 'admin')), '[]'::jsonb),
    'aprovacoesPendentes', (
      select count(*) from public.approvals ap
       where ap.org_id = p_org and ap.status::text = 'pending' and ap.excluido_em is null),
    'mesesTravados', coalesce((
      select jsonb_agg(to_char(ap.period, 'YYYY-MM'))
        from public.accounting_periods ap
       where ap.org_id = p_org and ap.status = 'locked' and ap.excluido_em is null), '[]'::jsonb),
    'envios', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', e.tipo, 'chave', e.chave, 'canal', e.canal,
                                          'status', e.status, 'em', e.criado_em))
        from (select * from public.automacao_envios
               where org_id = p_org and criado_em > now() - interval '60 days'
               order by criado_em desc limit 3000) e), '[]'::jsonb)
  ) into v;
  return v;
end $$;

revoke all on function public.automacao_contexto(uuid) from public, anon, authenticated;
grant execute on function public.automacao_contexto(uuid) to service_role;
