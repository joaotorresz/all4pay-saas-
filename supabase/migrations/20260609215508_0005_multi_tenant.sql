-- ============================================================
--  all4pay — Multi-tenant (organizações) + seed por organização
--  Isola todos os dados por organização via RLS e popula cada
--  organização nova com cadastros iniciais (categorias, centros
--  de custo, unidades, conta). Substitui as policies abertas
--  `to authenticated using (true)` das migrations 0001–0004.
--
--  Como funciona:
--   • Cada usuário recebe (no signup) uma organização própria +
--     membership 'owner', via trigger em auth.users.
--   • `org_id` entra em todas as tabelas com DEFAULT auth_org_id()
--     — o app NÃO precisa enviar org_id nos inserts; o default
--     resolve a organização do usuário logado.
--   • As policies passam a exigir org_id = auth_org_id().
--   • O seed roda por organização (no trigger e no backfill), então
--     cada conta nova já começa com cadastros básicos.
-- ============================================================

-- ---------- 1. Organizações + membros ----------
create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  org_id     uuid not null references public.organizations (id) on delete cascade,
  user_id    uuid not null references auth.users (id)           on delete cascade,
  role       text not null default 'member',     -- owner | admin | member
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

-- ---------- 2. Resolver a organização do usuário logado ----------
-- SECURITY DEFINER: ignora RLS de organization_members (evita recursão
-- quando usado dentro das policies). STABLE: ok como DEFAULT de coluna.
create or replace function public.auth_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id
  from public.organization_members
  where user_id = auth.uid()
  order by created_at
  limit 1;
$$;

-- ---------- 3. Seed inicial (por organização) ----------
create or replace function public.seed_org(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.categories (org_id, kind, name) values
    (p_org, 'receita', 'Vendas'),
    (p_org, 'receita', 'Serviços prestados'),
    (p_org, 'receita', 'Juros recebidos'),
    (p_org, 'receita', 'Outras receitas'),
    (p_org, 'despesa', 'Fornecedores'),
    (p_org, 'despesa', 'Folha de pagamento'),
    (p_org, 'despesa', 'Aluguel'),
    (p_org, 'despesa', 'Impostos e taxas'),
    (p_org, 'despesa', 'Marketing'),
    (p_org, 'despesa', 'Utilidades (água, luz, internet)'),
    (p_org, 'despesa', 'Tarifas bancárias'),
    (p_org, 'despesa', 'Outras despesas');

  insert into public.cost_centers (org_id, name) values
    (p_org, 'Administrativo'),
    (p_org, 'Comercial'),
    (p_org, 'Operacional'),
    (p_org, 'Financeiro');

  insert into public.units (org_id, name, abbrev) values
    (p_org, 'Unidade',    'un'),
    (p_org, 'Quilograma', 'kg'),
    (p_org, 'Litro',      'L'),
    (p_org, 'Hora',       'h'),
    (p_org, 'Metro',      'm'),
    (p_org, 'Caixa',      'cx');

  insert into public.financial_accounts (org_id, name, bank, balance) values
    (p_org, 'Conta corrente', 'inter', 0);
end;
$$;

-- ---------- 4. Provisionar org + seed a cada novo usuário ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org  uuid;
  v_name text;
begin
  v_name := coalesce(
    nullif(new.raw_user_meta_data->>'company', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Minha empresa'
  );
  insert into public.organizations (name) values (v_name) returning id into v_org;
  insert into public.organization_members (org_id, user_id, role) values (v_org, new.id, 'owner');
  perform public.seed_org(v_org);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 5. RLS das tabelas de organização ----------
alter table public.organizations        enable row level security;
alter table public.organization_members enable row level security;

create policy "orgs read own" on public.organizations
  for select to authenticated using (id = public.auth_org_id());
create policy "members read own" on public.organization_members
  for select to authenticated using (user_id = auth.uid());

-- ---------- 6. org_id em todas as tabelas de dados ----------
-- DEFAULT auth_org_id() preenche no insert; NOT NULL seguro (tabelas vazias).
alter table public.financial_accounts add column org_id uuid not null default public.auth_org_id() references public.organizations (id) on delete cascade;
alter table public.movements          add column org_id uuid not null default public.auth_org_id() references public.organizations (id) on delete cascade;
alter table public.categories         add column org_id uuid not null default public.auth_org_id() references public.organizations (id) on delete cascade;
alter table public.cost_centers       add column org_id uuid not null default public.auth_org_id() references public.organizations (id) on delete cascade;
alter table public.parties            add column org_id uuid not null default public.auth_org_id() references public.organizations (id) on delete cascade;
alter table public.movement_splits    add column org_id uuid not null default public.auth_org_id() references public.organizations (id) on delete cascade;
alter table public.recurrences        add column org_id uuid not null default public.auth_org_id() references public.organizations (id) on delete cascade;
alter table public.brands             add column org_id uuid not null default public.auth_org_id() references public.organizations (id) on delete cascade;
alter table public.units              add column org_id uuid not null default public.auth_org_id() references public.organizations (id) on delete cascade;
alter table public.salespeople        add column org_id uuid not null default public.auth_org_id() references public.organizations (id) on delete cascade;
alter table public.products           add column org_id uuid not null default public.auth_org_id() references public.organizations (id) on delete cascade;
alter table public.services           add column org_id uuid not null default public.auth_org_id() references public.organizations (id) on delete cascade;
alter table public.sales_docs         add column org_id uuid not null default public.auth_org_id() references public.organizations (id) on delete cascade;
alter table public.sale_items         add column org_id uuid not null default public.auth_org_id() references public.organizations (id) on delete cascade;
alter table public.financial_rules    add column org_id uuid not null default public.auth_org_id() references public.organizations (id) on delete cascade;
alter table public.rule_executions    add column org_id uuid not null default public.auth_org_id() references public.organizations (id) on delete cascade;
alter table public.audit_log          add column org_id uuid not null default public.auth_org_id() references public.organizations (id) on delete cascade;

create index financial_accounts_org_idx on public.financial_accounts (org_id);
create index movements_org_idx          on public.movements (org_id);
create index categories_org_idx         on public.categories (org_id);
create index cost_centers_org_idx       on public.cost_centers (org_id);
create index parties_org_idx            on public.parties (org_id);
create index movement_splits_org_idx    on public.movement_splits (org_id);
create index recurrences_org_idx        on public.recurrences (org_id);
create index brands_org_idx             on public.brands (org_id);
create index units_org_idx              on public.units (org_id);
create index salespeople_org_idx        on public.salespeople (org_id);
create index products_org_idx           on public.products (org_id);
create index services_org_idx           on public.services (org_id);
create index sales_docs_org_idx         on public.sales_docs (org_id);
create index sale_items_org_idx         on public.sale_items (org_id);
create index financial_rules_org_idx    on public.financial_rules (org_id);
create index rule_executions_org_idx    on public.rule_executions (org_id);
create index audit_log_org_idx          on public.audit_log (org_id);

-- ---------- 7. Trocar policies abertas por policies por organização ----------
-- 0001
drop policy if exists "authenticated read accounts"  on public.financial_accounts;
drop policy if exists "authenticated read movements"  on public.movements;
-- 0002
drop policy if exists "auth read categories"          on public.categories;
drop policy if exists "auth write categories"         on public.categories;
drop policy if exists "auth read cost_centers"        on public.cost_centers;
drop policy if exists "auth write cost_centers"       on public.cost_centers;
drop policy if exists "auth read parties"             on public.parties;
drop policy if exists "auth write parties"            on public.parties;
drop policy if exists "auth rw splits"                on public.movement_splits;
drop policy if exists "auth rw recurrences"           on public.recurrences;
drop policy if exists "auth write movements"          on public.movements;
-- 0003
drop policy if exists "auth rw brands"                on public.brands;
drop policy if exists "auth rw units"                 on public.units;
drop policy if exists "auth rw salespeople"           on public.salespeople;
drop policy if exists "auth rw products"              on public.products;
drop policy if exists "auth rw services"              on public.services;
drop policy if exists "auth rw sales_docs"            on public.sales_docs;
drop policy if exists "auth rw sale_items"            on public.sale_items;
-- 0004
drop policy if exists "auth rw rules"                 on public.financial_rules;
drop policy if exists "auth rw executions"            on public.rule_executions;
drop policy if exists "auth read audit"               on public.audit_log;
drop policy if exists "auth write audit"              on public.audit_log;

-- Policies novas: leitura e escrita restritas à organização do usuário.
create policy "org rw accounts"      on public.financial_accounts for all to authenticated using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy "org rw movements"     on public.movements          for all to authenticated using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy "org rw categories"    on public.categories         for all to authenticated using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy "org rw cost_centers"  on public.cost_centers       for all to authenticated using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy "org rw parties"       on public.parties            for all to authenticated using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy "org rw splits"        on public.movement_splits    for all to authenticated using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy "org rw recurrences"   on public.recurrences        for all to authenticated using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy "org rw brands"        on public.brands             for all to authenticated using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy "org rw units"         on public.units              for all to authenticated using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy "org rw salespeople"   on public.salespeople        for all to authenticated using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy "org rw products"      on public.products           for all to authenticated using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy "org rw services"      on public.services           for all to authenticated using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy "org rw sales_docs"    on public.sales_docs         for all to authenticated using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy "org rw sale_items"    on public.sale_items         for all to authenticated using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy "org rw rules"         on public.financial_rules    for all to authenticated using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy "org rw executions"    on public.rule_executions    for all to authenticated using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy "org rw audit"         on public.audit_log          for all to authenticated using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());

-- ---------- 8. Backfill: organização + seed para usuários já existentes ----------
do $$
declare
  u     record;
  v_org uuid;
begin
  for u in
    select a.id, a.email
    from auth.users a
    where not exists (
      select 1 from public.organization_members m where m.user_id = a.id
    )
  loop
    insert into public.organizations (name)
      values (coalesce(nullif(split_part(coalesce(u.email, ''), '@', 1), ''), 'Minha empresa'))
      returning id into v_org;
    insert into public.organization_members (org_id, user_id, role) values (v_org, u.id, 'owner');
    perform public.seed_org(v_org);
  end loop;
end $$;
