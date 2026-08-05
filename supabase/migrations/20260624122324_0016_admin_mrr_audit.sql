-- ============================================================
-- 0016 — Admin: MRR histórico (snapshots) + log de auditoria
-- ------------------------------------------------------------
-- Snapshots mensais de MRR (histórico real acumula a partir daqui; meses sem
-- snapshot são derivados de subscriptions+orgs) e trilha de auditoria das ações
-- do super-admin (cobrança, planos, impersonação). Tudo gateado por
-- is_platform_admin(). Recria admin_set_subscription/admin_upsert_plan p/ auditar.
-- ============================================================

create table if not exists public.mrr_snapshots (
  month date primary key,
  mrr numeric(20,2) not null default 0,
  orgs_ativas int not null default 0,
  captured_at timestamptz not null default now()
);

create table if not exists public.admin_audit (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users (id),
  action text not null,
  target text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.mrr_snapshots enable row level security;
alter table public.admin_audit enable row level security;

-- Registra uma ação do admin na trilha (SECURITY DEFINER; chamada interna/RPC).
create or replace function public.admin_log(p_action text, p_target text, p_detail jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  insert into public.admin_audit (admin_id, action, target, detail) values (auth.uid(), p_action, p_target, coalesce(p_detail, '{}'::jsonb));
end; $$;

-- Captura o snapshot do mês corrente (MRR ativo + nº de orgs ativas).
create or replace function public.admin_capture_mrr()
returns void language plpgsql security definer set search_path = public as $$
declare m date := date_trunc('month', now())::date;
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  insert into public.mrr_snapshots (month, mrr, orgs_ativas, captured_at)
  values (m,
    coalesce((select sum(mrr) from public.subscriptions where status='active'),0),
    (select count(*)::int from public.subscriptions where status='active'),
    now())
  on conflict (month) do update set mrr = excluded.mrr, orgs_ativas = excluded.orgs_ativas, captured_at = now();
end; $$;

-- Histórico de MRR (13 meses): snapshot real quando existe, senão derivado
-- (soma do MRR ativo das orgs criadas até o mês).
create or replace function public.admin_mrr_history()
returns table (mes text, mrr numeric, fonte text)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  return query
    select to_char(g.m, 'YYYY-MM'),
      coalesce(
        (select sn.mrr from public.mrr_snapshots sn where sn.month = g.m::date),
        (select coalesce(sum(s.mrr),0) from public.subscriptions s
           join public.organizations o on o.id = s.org_id
           where s.status = 'active' and o.created_at < (g.m + interval '1 month'))
      ),
      (case when exists (select 1 from public.mrr_snapshots sn where sn.month = g.m::date) then 'snapshot' else 'derivado' end)
    from generate_series(date_trunc('month', now()) - interval '12 months', date_trunc('month', now()), interval '1 month') as g(m)
    order by 1;
end; $$;

-- Trilha de auditoria (últimas N ações do admin).
create or replace function public.admin_audit_log()
returns table (id uuid, acao text, alvo text, detalhe jsonb, quando timestamptz, admin_email text)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  return query
    select a.id, a.action, a.target, a.detail, a.created_at, u.email::text
    from public.admin_audit a left join auth.users u on u.id = a.admin_id
    order by a.created_at desc limit 100;
end; $$;

-- Recria com auditoria embutida.
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
  insert into public.admin_audit (admin_id, action, target, detail)
  values (auth.uid(), 'subscription.set', p_org::text, jsonb_build_object('status', p_status, 'mrr', coalesce(p_mrr,0), 'plan', p_plan));
end; $$;

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
  insert into public.admin_audit (admin_id, action, target, detail)
  values (auth.uid(), 'plan.upsert', v_id::text, jsonb_build_object('name', p_name, 'price', coalesce(p_price,0), 'active', coalesce(p_active,true)));
  return v_id;
end; $$;

revoke all on function public.admin_log(text, text, jsonb), public.admin_capture_mrr(), public.admin_mrr_history(), public.admin_audit_log() from public, anon;
grant execute on function public.admin_log(text, text, jsonb), public.admin_capture_mrr(), public.admin_mrr_history(), public.admin_audit_log() to authenticated;
