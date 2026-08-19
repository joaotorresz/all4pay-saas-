-- LOTE P-19 — 9 migrations. COLE INTEIRO, SEM EDITAR NADA.
--
--   PRE-REQUISITO (uma vez, ANTES de colar): crie o segredo no cofre pelo
--   painel do Supabase — Project Settings > Vault > New secret — com o NOME
--   exato  cron_secret  e, como valor, o mesmo CRON_SECRET da Vercel.
--
--   Se ele nao existir, este lote PARA com instrucao e NADA e gravado.
--   Nenhum valor de segredo trafega neste arquivo, de proposito.

begin;

revoke all on public.maq_leads        from authenticated, anon;
revoke all on public.maq_whatsapp_log from authenticated, anon;
comment on table public.maq_leads is
  'Leads da maquininha. Sem politica de RLS: so o dono e service_role alcancam. Grant de authenticated/anon revogado em 17/08/2026 (A4P-070).';
comment on table public.maq_whatsapp_log is
  'Log de WhatsApp da maquininha. Sem politica de RLS: so o dono e service_role alcancam. Grant de authenticated/anon revogado em 17/08/2026 (A4P-070).';

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20260817151634', 'maq_revoga_grant_residual_sem_politica', array['aplicada manualmente no lote P-19']) on conflict (version) do nothing;

create or replace function public.org_movements(p_de date, p_ate date)
returns table (
  org_id       uuid,
  org_nome     text,
  id           uuid,
  account_id   uuid,
  type         text,
  status       text,
  amount       numeric,
  due_date     date,
  paid_date    date,
  party_id     uuid,
  party_nome   text,
  categoria    text,
  centro       text,
  projeto      text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    m.org_id,
    o.name                as org_nome,
    m.id,
    m.account_id,
    m.type::text,
    m.status::text,
    m.amount,
    m.due_date,
    m.paid_date,
    m.party_id,
    p.name                as party_nome,
    coalesce(c.name, m.category) as categoria,
    cc.name               as centro,
    pr.name               as projeto
  from public.movements m
    join public.organizations o   on o.id = m.org_id
    left join public.parties p    on p.id = m.party_id
    left join public.categories c on c.id = m.category_id
    left join public.cost_centers cc on cc.id = m.cost_center_id
    left join public.projects pr  on pr.id = m.project_id
  -- O ESCOPO é o que torna a função segura: só as organizações em que o
  -- usuário logado é membro. `security definer` sem esta cláusula vazaria o
  -- financeiro de todos os tenants.
  where m.org_id in (
      select om.org_id from public.organization_members om
      where om.user_id = auth.uid()
    )
    and coalesce(m.paid_date, m.due_date) between p_de and p_ate
$$;
create or replace function public.org_balances()
returns table (org_id uuid, org_nome text, saldo numeric)
language sql
security definer
stable
set search_path = public
as $$
  select fa.org_id, o.name, coalesce(sum(fa.balance), 0)
  from public.financial_accounts fa
    join public.organizations o on o.id = fa.org_id
  where fa.org_id in (
      select om.org_id from public.organization_members om
      where om.user_id = auth.uid()
    )
  group by fa.org_id, o.name
$$;
revoke all on function public.org_movements(date, date) from public, anon;
revoke all on function public.org_balances() from public, anon;
grant execute on function public.org_movements(date, date) to authenticated;
grant execute on function public.org_balances() to authenticated;

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20260817193000', 'funcoes_definer_stable_alinha_producao', array['aplicada manualmente no lote P-19']) on conflict (version) do nothing;

create or replace function public.assinatura_inicial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- ⚠️ `on conflict do nothing`: a chave é o `org_id`, e o provisionamento de
  -- signup pode evoluir para criar a assinatura por outro caminho. Um erro
  -- aqui derrubaria o CADASTRO do usuário — a cobrança nunca pode impedir
  -- alguém de entrar.
  insert into public.subscriptions (org_id, status, mrr, started_at, current_period_end)
  values (new.id, 'trial', 0, current_date, current_date + 14)
  on conflict (org_id) do nothing;
  return new;
end;
$$;
revoke all on function public.assinatura_inicial() from public, anon, authenticated;
drop trigger if exists organizations_assinatura_inicial on public.organizations;
create trigger organizations_assinatura_inicial
  after insert on public.organizations
  for each row execute function public.assinatura_inicial();
insert into public.subscriptions (org_id, status, mrr, started_at, current_period_end)
select o.id, 'trial', 0, current_date, current_date + 14
from public.organizations o
where not exists (select 1 from public.subscriptions s where s.org_id = o.id)
on conflict (org_id) do nothing;
update public.subscriptions
   set current_period_end = current_date + 14, started_at = coalesce(started_at, current_date)
 where status = 'trial' and current_period_end is null;
create or replace function public.org_pode_escrever(p_org uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- ⚠️ Sem linha de assinatura ⇒ PODE. A ausência é o defeito que a parte 2
  -- desta migration acabou de corrigir; tratá-la como bloqueio faria o produto
  -- fechar a porta de quem já está dentro, no primeiro deploy.
  select coalesce(
    (
      select case
        when s.status in ('past_due', 'canceled') then false
        when s.current_period_end is null then true
        else s.current_period_end >= current_date
      end
      from public.subscriptions s
      where s.org_id = coalesce(p_org, public.auth_org_id())
    ),
    true
  );
$$;
revoke all on function public.org_pode_escrever(uuid) from public, anon;
grant execute on function public.org_pode_escrever(uuid) to authenticated;
drop policy if exists movements_escrita_exige_assinatura on public.movements;
create policy movements_escrita_exige_assinatura on public.movements
  as restrictive for all to authenticated
  using (true)
  with check (public.org_pode_escrever());
drop policy if exists movements_delete_exige_assinatura on public.movements;
create policy movements_delete_exige_assinatura on public.movements
  as restrictive for delete to authenticated
  using (public.org_pode_escrever());
drop policy if exists splits_escrita_exige_assinatura on public.movement_splits;
create policy splits_escrita_exige_assinatura on public.movement_splits
  as restrictive for all to authenticated
  using (true)
  with check (public.org_pode_escrever());
drop policy if exists splits_delete_exige_assinatura on public.movement_splits;
create policy splits_delete_exige_assinatura on public.movement_splits
  as restrictive for delete to authenticated
  using (public.org_pode_escrever());
drop policy if exists sales_docs_escrita_exige_assinatura on public.sales_docs;
create policy sales_docs_escrita_exige_assinatura on public.sales_docs
  as restrictive for all to authenticated
  using (true)
  with check (public.org_pode_escrever());
drop policy if exists sales_docs_delete_exige_assinatura on public.sales_docs;
create policy sales_docs_delete_exige_assinatura on public.sales_docs
  as restrictive for delete to authenticated
  using (public.org_pode_escrever());
drop policy if exists recurrences_escrita_exige_assinatura on public.recurrences;
create policy recurrences_escrita_exige_assinatura on public.recurrences
  as restrictive for all to authenticated
  using (true)
  with check (public.org_pode_escrever());
drop policy if exists recurrences_delete_exige_assinatura on public.recurrences;
create policy recurrences_delete_exige_assinatura on public.recurrences
  as restrictive for delete to authenticated
  using (public.org_pode_escrever());
create or replace function public.assinatura_da_org()
returns table (
  status text,
  plano text,
  mrr numeric,
  inicio date,
  fim date,
  dias_restantes integer,
  pode_escrever boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(s.status, 'none')                       as status,
    p.name                                           as plano,
    coalesce(s.mrr, 0)                               as mrr,
    s.started_at                                     as inicio,
    s.current_period_end                             as fim,
    (s.current_period_end - current_date)::int       as dias_restantes,
    public.org_pode_escrever(o.id)                   as pode_escrever
  from public.organizations o
  left join public.subscriptions s on s.org_id = o.id
  left join public.plans p on p.id = s.plan_id
  where o.id = public.auth_org_id();
$$;
revoke all on function public.assinatura_da_org() from public, anon;
grant execute on function public.assinatura_da_org() to authenticated;
update public.plans set features = jsonb_build_object('limite_lancamentos', 500)   where name = 'Starter'    and features = '{}'::jsonb;
update public.plans set features = jsonb_build_object('limite_lancamentos', 5000)  where name = 'Pro'        and features = '{}'::jsonb;
update public.plans set features = jsonb_build_object('limite_lancamentos', null)  where name = 'Enterprise' and features = '{}'::jsonb;
drop function if exists public.admin_orgs();
create or replace function public.admin_orgs()
returns table (
  org_id uuid, nome text, criado timestamptz, membros int,
  plano text, status text, mrr numeric, expira date,
  limite_lancamentos int, ultimo_mov date, movimentos int
)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  return query
    select o.id, o.name, o.created_at,
      (select count(*)::int from public.organization_members m where m.org_id = o.id),
      coalesce(p.name, '—'),
      coalesce(s.status, 'none'),
      coalesce(s.mrr, 0),
      s.current_period_end,
      nullif(p.features->>'limite_lancamentos', '')::int,
      (select max(mv.due_date) from public.movements mv where mv.org_id = o.id),
      (select count(*)::int from public.movements mv where mv.org_id = o.id)
    from public.organizations o
    left join public.subscriptions s on s.org_id = o.id
    left join public.plans p on p.id = s.plan_id
    order by o.created_at desc;
end; $$;
revoke all on function public.admin_orgs() from public, anon;
grant execute on function public.admin_orgs() to authenticated;

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20260818160000', 'trial_com_prazo_e_bloqueio_suave', array['aplicada manualmente no lote P-19']) on conflict (version) do nothing;

create table if not exists public.own_token_cache (
  chave text not null,
  access_token text,
  expira_em timestamp with time zone,
  obtido_em timestamp with time zone,
  bloqueado_ate timestamp with time zone,
  lease_ate timestamp with time zone,
  ultimo_erro text,
  autenticacoes_hoje integer not null default 0,
  dia_contagem date,
  atualizado_em timestamp with time zone not null default now(),
  constraint own_token_cache_pkey primary key (chave)
);
comment on table public.own_token_cache is
  'Um registro por ambiente da OWN (sandbox/producao). Guarda o token vivo, a janela de bloqueio do perímetro e o lease de quem está autenticando agora.';
comment on column public.own_token_cache.bloqueado_ate is
  'Enquanto for futuro, ninguém tenta falar com a OWN. Escrito ao receber 429 ou 403-HTML. Medido em sandbox: o bloqueio dura ~7 minutos.';
comment on column public.own_token_cache.lease_ate is
  'Reserva de curta duração dada a um chamador para autenticar. Impede que duas invocações concorrentes façam dois logins — que é o gatilho do 429.';
comment on column public.own_token_cache.autenticacoes_hoje is
  'Telemetria. Se subir muito acima de (1440 / intervalo_do_job), há reautenticação indevida em algum lugar.';
alter table public.own_token_cache enable row level security;
revoke all on public.own_token_cache from anon, authenticated;
create table if not exists public.maq_cnpj_cache (
  cnpj text not null,
  cnae bigint,
  razao_social text,
  nome_fantasia text,
  cnae_descricao text,
  situacao text,
  cached_at timestamp with time zone not null default now(),
  constraint maq_cnpj_cache_pkey primary key (cnpj)
);
alter table public.maq_cnpj_cache enable row level security;
CREATE OR REPLACE FUNCTION public.own_token_pegar(p_chave text DEFAULT 'sandbox'::text, p_margem integer DEFAULT 45)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.own_token_cache;
begin
  insert into public.own_token_cache(chave) values (p_chave) on conflict (chave) do nothing;
  select * into r from public.own_token_cache where chave = p_chave for update;

  if r.bloqueado_ate is not null and r.bloqueado_ate > now() then
    return jsonb_build_object('estado','bloqueado','ate',r.bloqueado_ate,
                              'segundos', ceil(extract(epoch from r.bloqueado_ate - now())));
  end if;

  if r.access_token is not null and r.expira_em > now() + make_interval(secs => p_margem) then
    return jsonb_build_object('estado','ok','token',r.access_token,'expira_em',r.expira_em);
  end if;

  if r.lease_ate is not null and r.lease_ate > now() then
    return jsonb_build_object('estado','aguarde','ate',r.lease_ate);
  end if;

  update public.own_token_cache
     set lease_ate = now() + interval '20 seconds', atualizado_em = now()
   where chave = p_chave;

  return jsonb_build_object('estado','autentique');
end $function$;
CREATE OR REPLACE FUNCTION public.own_token_gravar(p_chave text, p_token text, p_expires_in integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.own_token_cache
     set access_token = p_token,
         expira_em    = now() + make_interval(secs => greatest(p_expires_in, 30)),
         obtido_em    = now(),
         lease_ate    = null,
         bloqueado_ate = null,
         ultimo_erro  = null,
         autenticacoes_hoje = case when dia_contagem = current_date
                                   then autenticacoes_hoje + 1 else 1 end,
         dia_contagem = current_date,
         atualizado_em = now()
   where chave = p_chave;
end $function$;
CREATE OR REPLACE FUNCTION public.own_token_bloquear(p_chave text, p_segundos integer DEFAULT 420, p_erro text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.own_token_cache
     set bloqueado_ate = now() + make_interval(secs => p_segundos),
         lease_ate     = null,
         access_token  = null,
         ultimo_erro   = p_erro,
         atualizado_em = now()
   where chave = p_chave;
end $function$;
CREATE OR REPLACE FUNCTION public.own_saude()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'ultima_sincronizacao', (select max(concluido_em) from public.own_sync_execucoes where status = 'ok'),
    'atraso_minutos', (select floor(extract(epoch from now() - max(concluido_em))/60)
                         from public.own_sync_execucoes where status = 'ok'),
    'ultimo_status',  (select status from public.own_sync_execucoes order by iniciado_em desc limit 1),
    'perimetro_bloqueado_ate', (select bloqueado_ate from public.own_token_cache
                                 where bloqueado_ate > now() order by bloqueado_ate desc limit 1),
    'eventos_webhook_pendentes', (select count(*) from public.own_webhook_eventos where processado_em is null)
  );
$function$;
create or replace view public.own_extrato_lojista
  with (security_invoker = true) as
 SELECT t.org_id,
    t.lojista_id,
    l.doc_parceiro,
    t.identificador_transacao,
    t.data_transacao,
    t.valor AS valor_bruto,
    t.mdr AS taxa_mdr,
    t.valor - COALESCE(t.mdr, 0::numeric) AS valor_liquido_previsto,
    t.quantidade_parcelas,
    t.status_transacao,
    t.bandeira,
    t.modalidade,
    t.numero_cartao,
    t.numero_serie,
    t.codigo_autorizacao,
    ( SELECT count(*) AS count
           FROM own_parcelas p
          WHERE p.transacao_id = t.id AND p.status_pagamento ~~* 'pago'::text) AS parcelas_pagas,
    ( SELECT COALESCE(sum(p.valor_parcela), 0::numeric) AS "coalesce"
           FROM own_parcelas p
          WHERE p.transacao_id = t.id AND p.status_pagamento ~~* 'pago'::text) AS valor_ja_liquidado,
    ( SELECT min(p.data_pagamento_prevista) AS min
           FROM own_parcelas p
          WHERE p.transacao_id = t.id AND p.data_pagamento_real IS NULL) AS proximo_vencimento
   FROM own_transacoes t
     JOIN own_lojistas l ON l.id = t.lojista_id;
comment on view public.own_extrato_lojista is
  'Forma estável que o ERP do lojista enxerga. Não expõe cnpj_cliente da Privilege nem estrutura da adquirente — se a OWN mudar de schema amanhã, esta view absorve a mudança e o contrato com o ERP não quebra.';

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20260818200000', 'own_maq_esquema_verbatim', array['aplicada manualmente no lote P-19']) on conflict (version) do nothing;

do $$
declare
  t text;
  -- Cadastros e negócio: toda escrita passa pelo cliente do navegador, sob RLS.
  revogar text[] := array[
    'categories','products','services','parties','cost_centers','projects',
    'brands','units','salespeople','budgets','dimensions','entities','schedules',
    'sale_items','sales_docs',
    -- Ledger e contabilidade: cliente authenticated + RPCs DEFINER.
    'journal_entries','journal_lines','ledger_accounts','accounting_periods',
    'fechamentos','close_tasks','movement_splits','movement_tags','nfse',
    'revenue_contracts','revenue_schedule','reembolsos','approvals',
    'financial_rules','rule_executions','pos_rates','company_profiles',
    'ai_actions','ai_learning','org_state','raw_events',
    -- Plataforma: alcançadas só pelas RPCs admin_* (DEFINER), nunca por .from().
    'plans','subscriptions','platform_admins','platform_admin_permitidos',
    'admin_acessos','mrr_snapshots','role_permissions','user_active_org',
    'organizations','rota_alias_acessos','ddl_log',
    -- own_token_cache: alcançada SÓ via own_token_pegar/gravar/bloquear (DEFINER).
    'own_token_cache','maq_cost_rate'
  ];
begin
  foreach t in array revogar loop
    -- to_regclass evita quebrar se uma tabela não existir neste banco.
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on public.%I from service_role', t);
    end if;
  end loop;
end $$;
revoke all on function public.own_token_pegar(text, integer) from public, anon, authenticated;
revoke all on function public.own_token_gravar(text, text, integer) from public, anon, authenticated;
revoke all on function public.own_token_bloquear(text, integer, text) from public, anon, authenticated;
revoke all on function public.own_saude() from public, anon;
grant execute on function public.own_saude() to authenticated;

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20260818200100', 'service_role_grants_minimos', array['aplicada manualmente no lote P-19']) on conflict (version) do nothing;

alter table public.movements
  add column if not exists situacao text not null default 'previsto'
    check (situacao in ('previsto','confirmado','baixado','conciliado','cancelado','estornado'));
update public.movements set situacao =
  case
    when status = 'pago' then 'baixado'
    when status = 'cancelado' then 'cancelado'
    else 'previsto'
  end
where situacao = 'previsto';
alter table public.movements
  add column if not exists lancado_por uuid default auth.uid(),
  add column if not exists confirmado_por uuid,
  add column if not exists confirmado_em timestamptz,
  add column if not exists baixado_por uuid,
  add column if not exists baixado_em timestamptz;
create table if not exists public.central_alcada (
  id uuid not null default gen_random_uuid(),
  org_id uuid not null default public.auth_org_id(),
  papel text not null,
  teto_valor numeric,
  atualizado_em timestamptz not null default now(),
  primary key (org_id, papel)
);
alter table public.central_alcada alter column teto_valor drop not null;
alter table public.central_alcada enable row level security;
comment on column public.central_alcada.teto_valor is
  'Valor máximo que este papel confirma sozinho. NULL = sem teto (owner/admin). 0 = não confirma nada. Editável por organização.';
drop trigger if exists zz_auditar_central_alcada on public.central_alcada;
create trigger zz_auditar_central_alcada
  after insert or update or delete on public.central_alcada
  for each row execute function public.auditar_escrita();
drop policy if exists central_alcada_org on public.central_alcada;
create policy central_alcada_org on public.central_alcada
  for all to authenticated
  using (org_id = public.auth_org_id())
  with check (org_id = public.auth_org_id());
drop policy if exists central_alcada_escrita_admin on public.central_alcada;
create policy central_alcada_escrita_admin on public.central_alcada
  as restrictive for all to authenticated
  using (true)
  with check (public.tem_permissao('administrar'));
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

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20260818210000', 'central_maquina_de_estados', array['aplicada manualmente no lote P-19']) on conflict (version) do nothing;

create or replace function public.org_member_update(p_user_id uuid, p_display_name text, p_email text, p_permissions jsonb, p_approval_limit numeric, p_can_cancel boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.org_is_admin() then raise exception 'Sem permissão para alterar membros.'; end if;
  -- ⚠️ `p_approval_limit` é recebido e DESCARTADO. A alçada mora em
  -- `central_alcada` (por papel) e é lida pelo gatilho da Central. Aceitar o
  -- parâmetro e não gravar é o que mantém compatível o cliente já publicado
  -- sem deixar a coluna morta receber valor novo.
  update public.organization_members
     set display_name = p_display_name,
         email = p_email,
         permissions = coalesce(p_permissions, '{}'::jsonb),
         can_cancel = coalesce(p_can_cancel, false)
   where org_id = public.auth_org_id() and user_id = p_user_id;
end; $$;
comment on column public.organization_members.approval_limit is
  'DEPRECADA em 19/08/2026 (P-19). A alçada mora em central_alcada.teto_valor, por PAPEL, e é lida pelo gatilho central_maquina. Esta coluna nunca teve leitor e era escrita errada: parseLimite convertia "R$50 mil" em 50 e "Sem limite" em 0. org_member_update deixou de gravá-la; os valores existentes ficam como dívida declarada até decisão do dono. Não voltar a escrever — há guarda com teto ZERO.';
comment on column public.central_alcada.teto_valor is
  'A ÚNICA morada do teto de aprovação. NULL = sem teto (owner/admin). 0 = não confirma nada. Por PAPEL, editável por organização em Configurações. Quem pode aprovar sai de role_permissions; esta coluna responde só QUANTO.';

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20260819140000', 'alcada_morada_unica', array['aplicada manualmente no lote P-19']) on conflict (version) do nothing;

update public.organization_members
   set approval_limit = null
 where approval_limit is not null;

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20260819160000', 'alcada_descarta_valor_corrompido', array['aplicada manualmente no lote P-19']) on conflict (version) do nothing;

do $agendar$
begin
  if to_regnamespace('cron') is null or to_regnamespace('vault') is null then
    raise notice 'pg_cron/vault ausentes (banco efêmero): agendamento do Open Finance PULADO. Em produção estas extensões existem — se este aviso aparecer lá, o agendamento NÃO foi criado.';
    return;
  end if;

  -- ⚠️ **O SEGREDO NÃO ENTRA NESTE ARQUIVO — ele é PRÉ-REQUISITO.**
  --
  -- A versão anterior trazia um placeholder para o dono substituir à mão. Duas
  -- coisas estavam erradas nisso, e a segunda é a que importa:
  --   1. exigia lembrar de uma edição, e esquecer era o estado natural — o lote
  --      foi colado duas vezes sem a troca;
  --   2. fazia um segredo REAL trafegar por um arquivo de texto, colado num
  --      editor de SQL. Segredo não anda em arquivo.
  --
  -- Agora ele é criado UMA vez pelo painel (Dashboard → Project Settings →
  -- Vault → New secret), com o nome exato `cron_secret`, e esta migration
  -- apenas EXIGE que exista. Sem ele, para aqui com instrução — não agenda nada
  -- pela metade.
  if not exists (select 1 from vault.secrets where name = 'cron_secret') then
    raise exception using
      errcode = 'A4P19',
      message = 'O segredo cron_secret nao existe no cofre.',
      hint = 'Crie antes de colar o lote: Supabase Dashboard > Project Settings > Vault > New secret, com o NOME exato cron_secret e, como valor, o mesmo CRON_SECRET configurado na Vercel. Sem ele o agendamento nao e criado. Nada foi gravado: a transacao inteira foi desfeita.';
  end if;

  -- ⚠️ `unschedule` antes de agendar: sem isso, reaplicar criaria um segundo job
  -- com o mesmo propósito — inofensivo pela idempotência do ETL, mas ilegível
  -- para quem auditar o agendador. Em bloco porque `cron.unschedule` LANÇA
  -- quando o job não existe.
  begin execute $sql$ select cron.unschedule('openfinance-sync-manha') $sql$; exception when others then null; end;
  begin execute $sql$ select cron.unschedule('openfinance-sync-noite') $sql$; exception when others then null; end;

  execute $sql$
    select cron.schedule('openfinance-sync-manha', '0 9 * * *', $cron$
      select net.http_get(
        url := 'https://all4pay-saas.vercel.app/api/openfinance/sync',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
          'User-Agent', 'All4Pay-Cron/1.0'),
        timeout_milliseconds := 55000);
    $cron$)
  $sql$;

  execute $sql$
    select cron.schedule('openfinance-sync-noite', '0 21 * * *', $cron$
      select net.http_get(
        url := 'https://all4pay-saas.vercel.app/api/openfinance/sync',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
          'User-Agent', 'All4Pay-Cron/1.0'),
        timeout_milliseconds := 55000);
    $cron$)
  $sql$;

  raise notice 'Open Finance agendado: 09:00 e 21:00 UTC.';
end $agendar$;

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20260819180000', 'openfinance_pg_cron', array['aplicada manualmente no lote P-19']) on conflict (version) do nothing;

commit;
