-- ============================================================
-- 0013 — Consolidação multi-empresa (multi-entity)
-- ------------------------------------------------------------
-- Agrega a posição das organizações em que o USUÁRIO é membro (uma pessoa pode
-- pertencer a várias orgs via o convite do 0012). SECURITY DEFINER para somar
-- entre orgs, mas ESCOPADO: só as orgs onde `auth.uid()` é membro. Saldo = soma
-- das contas; receita/despesa = movimentos do período (competência, due_date),
-- sem cancelados. Não trata eliminações intercompany (v1).
-- ============================================================
create or replace function public.org_consolidado(p_de date, p_ate date)
returns table (org_id uuid, nome text, saldo numeric, receita numeric, despesa numeric, contas int)
language sql security definer stable set search_path = public as $$
  select
    o.id,
    o.name,
    coalesce((select sum(fa.balance) from public.financial_accounts fa where fa.org_id = o.id), 0),
    coalesce((select sum(m.amount) from public.movements m
              where m.org_id = o.id and m.type = 'entrada' and m.status <> 'cancelado'
                and m.due_date between p_de and p_ate), 0),
    coalesce((select sum(m.amount) from public.movements m
              where m.org_id = o.id and m.type = 'saida' and m.status <> 'cancelado'
                and m.due_date between p_de and p_ate), 0),
    coalesce((select count(*)::int from public.financial_accounts fa where fa.org_id = o.id), 0)
  from public.organizations o
  where o.id in (select om.org_id from public.organization_members om where om.user_id = auth.uid());
$$;

revoke all on function public.org_consolidado(date, date) from public;
revoke execute on function public.org_consolidado(date, date) from anon;
grant execute on function public.org_consolidado(date, date) to authenticated;
