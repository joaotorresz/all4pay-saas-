-- ============================================================
-- 0015 — Admin: crescimento + impersonação (ver como cliente)
-- ------------------------------------------------------------
-- Continua o modo super-admin (0014): série de crescimento (novos clientes/mês)
-- e o detalhe de UMA organização para o admin "ver como cliente" (read-only).
-- Tudo gateado por is_platform_admin() (cross-tenant só pelo dono da plataforma).
-- ============================================================

-- Novos clientes (orgs) por mês — últimos 13 meses.
create or replace function public.admin_growth()
returns table (mes text, novas int)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  return query
    select to_char(date_trunc('month', g.m), 'YYYY-MM') as mes,
      (select count(*)::int from public.organizations o
         where date_trunc('month', o.created_at) = g.m) as novas
    from generate_series(date_trunc('month', now()) - interval '12 months', date_trunc('month', now()), interval '1 month') as g(m)
    order by 1;
end; $$;

-- Detalhe de uma organização (impersonação read-only) — saldo, receita/despesa
-- (12m por competência), atividade, assinatura e equipe.
create or replace function public.admin_org_detail(p_org uuid)
returns json language plpgsql security definer stable set search_path = public as $$
declare r json; v_de date := (current_date - interval '12 months')::date;
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  select json_build_object(
    'org_id', o.id,
    'nome', o.name,
    'criado', o.created_at,
    'membros', (select count(*)::int from public.organization_members m where m.org_id = o.id),
    'contas', (select count(*)::int from public.financial_accounts fa where fa.org_id = o.id),
    'saldo', coalesce((select sum(fa.balance) from public.financial_accounts fa where fa.org_id = o.id), 0),
    'movimentos', (select count(*)::int from public.movements mv where mv.org_id = o.id),
    'ultimo_mov', (select max(mv.due_date) from public.movements mv where mv.org_id = o.id),
    'receita_12m', coalesce((select sum(mv.amount) from public.movements mv where mv.org_id = o.id and mv.type='entrada' and mv.status<>'cancelado' and mv.due_date >= v_de), 0),
    'despesa_12m', coalesce((select sum(mv.amount) from public.movements mv where mv.org_id = o.id and mv.type='saida' and mv.status<>'cancelado' and mv.due_date >= v_de), 0),
    'plano', coalesce(p.name, '—'),
    'status', coalesce(s.status, 'trial'),
    'mrr', coalesce(s.mrr, 0),
    'membros_lista', (select coalesce(json_agg(json_build_object('email', m.email, 'role', m.role, 'nome', m.display_name)), '[]'::json)
                      from public.organization_members m where m.org_id = o.id)
  ) into r
  from public.organizations o
  left join public.subscriptions s on s.org_id = o.id
  left join public.plans p on p.id = s.plan_id
  where o.id = p_org;
  return r;
end; $$;

revoke all on function public.admin_growth(), public.admin_org_detail(uuid) from public, anon;
grant execute on function public.admin_growth(), public.admin_org_detail(uuid) to authenticated;
