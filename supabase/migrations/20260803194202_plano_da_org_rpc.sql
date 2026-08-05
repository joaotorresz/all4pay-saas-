-- 0022 — O plano da PRÓPRIA organização, legível pelo próprio usuário.
--
-- `subscriptions` (0014) tem RLS sem policy: só as RPCs de super-admin a
-- alcançam. Isso é correto para a visão cross-tenant, mas deixava o app sem
-- forma de saber qual plano ELE tem — e foi por isso que o gating de Pro acabou
-- no menu, do lado do cliente, onde não trava nada.
--
-- Esta função devolve o plano da org do `auth.uid()` e nada mais.
create or replace function public.meu_plano()
returns table (plano text, status text, expira date, pro boolean)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(p.name, 'Simples')                as plano,
    coalesce(s.status, 'none')                 as status,
    s.current_period_end                       as expira,
    -- Pro = assinatura VIVA de um plano marcado como Pro.
    -- ⚠️ `trial` conta: um teste que não abre o produto não é um teste.
    -- `past_due` NÃO conta — é justamente o caso em que o acesso deve cessar.
    (
      coalesce(s.status, 'none') in ('active', 'trial')
      and coalesce(p.name, '') ilike '%pro%'
      and (s.current_period_end is null or s.current_period_end >= current_date)
    )                                          as pro
  from public.organization_members om
  left join public.subscriptions s on s.org_id = om.org_id
  left join public.plans p on p.id = s.plan_id
  where om.user_id = auth.uid()
  order by (coalesce(s.status,'none') in ('active','trial')) desc
  limit 1;
$$;

revoke all on function public.meu_plano() from anon;
grant execute on function public.meu_plano() to authenticated;