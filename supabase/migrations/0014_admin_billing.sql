-- ============================================================
-- 0014 — Modo Administrador da plataforma (SaaS) + billing
-- ------------------------------------------------------------
-- Visão CROSS-TENANT exclusiva do dono da plataforma (super-admin): todos os
-- usuários/orgs, quantos ativos, MRR e cobrança de mensalidades. Tudo via
-- funções SECURITY DEFINER GATEADAS por `is_platform_admin()` (a única porta
-- que enxerga além da própria org). Não afeta a RLS por org das demais tabelas.
-- ============================================================

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Planos de assinatura (mensalidade).
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price_month numeric(20,2) not null default 0,
  features jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Assinatura por organização (uma por org).
create table if not exists public.subscriptions (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  plan_id uuid references public.plans (id),
  status text not null default 'trial' check (status in ('trial','active','past_due','canceled')),
  mrr numeric(20,2) not null default 0,
  started_at date not null default current_date,
  current_period_end date,
  updated_at timestamptz not null default now()
);

-- Super-admin? (só o dono da plataforma)
create or replace function public.is_platform_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

-- Visão geral consolidada (KPIs da plataforma).
create or replace function public.admin_overview()
returns json language plpgsql security definer stable set search_path = public as $$
declare r json;
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  select json_build_object(
    'orgs',           (select count(*) from public.organizations),
    'orgs_ativas',    (select count(*) from public.subscriptions where status = 'active'),
    'trials',         (select count(*) from public.subscriptions where status = 'trial'),
    'inadimplentes',  (select count(*) from public.subscriptions where status = 'past_due'),
    'usuarios',       (select count(*) from auth.users),
    'usuarios_ativos',(select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
    'mrr',            coalesce((select sum(mrr) from public.subscriptions where status = 'active'), 0),
    'arr',            coalesce((select sum(mrr) from public.subscriptions where status = 'active'), 0) * 12
  ) into r;
  return r;
end; $$;

-- Organizações (clientes) com assinatura e atividade.
create or replace function public.admin_orgs()
returns table (org_id uuid, nome text, criado timestamptz, membros int, plano text, status text, mrr numeric, ultimo_mov date, movimentos int)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  return query
    select o.id, o.name, o.created_at,
      (select count(*)::int from public.organization_members m where m.org_id = o.id),
      coalesce(p.name, '—'),
      coalesce(s.status, 'trial'),
      coalesce(s.mrr, 0),
      (select max(mv.due_date) from public.movements mv where mv.org_id = o.id),
      (select count(*)::int from public.movements mv where mv.org_id = o.id)
    from public.organizations o
    left join public.subscriptions s on s.org_id = o.id
    left join public.plans p on p.id = s.plan_id
    order by o.created_at desc;
end; $$;

-- Usuários com conta (acesso, atividade, nº de orgs).
create or replace function public.admin_users()
returns table (user_id uuid, email text, criado timestamptz, ultimo_acesso timestamptz, orgs int)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  return query
    select u.id, u.email::text, u.created_at, u.last_sign_in_at,
      (select count(*)::int from public.organization_members m where m.user_id = u.id)
    from auth.users u
    order by u.created_at desc;
end; $$;

-- Define/atualiza a assinatura de uma org. Owner/admin da plataforma.
create or replace function public.admin_set_subscription(p_org uuid, p_plan uuid, p_status text, p_mrr numeric, p_period_end date default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  if p_status not in ('trial','active','past_due','canceled') then raise exception 'status inválido'; end if;
  insert into public.subscriptions (org_id, plan_id, status, mrr, current_period_end, updated_at)
  values (p_org, p_plan, p_status, coalesce(p_mrr, 0), p_period_end, now())
  on conflict (org_id) do update
    set plan_id = excluded.plan_id, status = excluded.status, mrr = excluded.mrr,
        current_period_end = excluded.current_period_end, updated_at = now();
end; $$;

-- CRUD de planos (super-admin).
create or replace function public.admin_upsert_plan(p_id uuid, p_name text, p_price numeric, p_active boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  if p_id is null then
    insert into public.plans (name, price_month, active) values (p_name, coalesce(p_price,0), coalesce(p_active,true)) returning id into v_id;
  else
    update public.plans set name = p_name, price_month = coalesce(p_price,0), active = coalesce(p_active,true) where id = p_id; v_id := p_id;
  end if;
  return v_id;
end; $$;

create or replace function public.admin_plans()
returns table (id uuid, name text, price_month numeric, active boolean, assinantes int)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  return query
    select p.id, p.name, p.price_month, p.active,
      (select count(*)::int from public.subscriptions s where s.plan_id = p.id and s.status = 'active')
    from public.plans p order by p.price_month asc;
end; $$;

-- RLS das tabelas novas (acesso só via as funções definer; sem leitura direta).
alter table public.platform_admins enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
-- sem policies = nega tudo no acesso direto (as funções definer bypassam).

-- Grants: as funções gateiam internamente; só authenticated chama.
revoke all on function public.is_platform_admin(), public.admin_overview(), public.admin_orgs(), public.admin_users(),
  public.admin_set_subscription(uuid, uuid, text, numeric, date), public.admin_upsert_plan(uuid, text, numeric, boolean), public.admin_plans() from public, anon;
grant execute on function public.is_platform_admin(), public.admin_overview(), public.admin_orgs(), public.admin_users(),
  public.admin_set_subscription(uuid, uuid, text, numeric, date), public.admin_upsert_plan(uuid, text, numeric, boolean), public.admin_plans() to authenticated;

-- Planos padrão.
insert into public.plans (name, price_month) values ('Starter', 149), ('Pro', 349), ('Enterprise', 990)
  on conflict do nothing;

-- Bootstrap do super-admin (o dono da plataforma), por e-mail.
insert into public.platform_admins (user_id)
  select id from auth.users where lower(email) = lower('joaovyoshimi@gmail.com')
  on conflict do nothing;
