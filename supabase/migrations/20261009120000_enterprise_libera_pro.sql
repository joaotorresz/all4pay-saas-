-- ═══════════════════════════════════════════════════════════════════════════
-- O PLANO ENTERPRISE LIBERA AS TELAS PRO (09/10/2026)
--
-- ⚠️ **Defeito medido em produção.** `meu_plano()` decidia o Pro pelo NOME do
-- plano (`ilike '%pro%'`). Os planos são Starter · Pro · Enterprise, e
-- "Enterprise" não contém "pro": a empresa no plano MAIS CARO (a única que
-- paga, R$ 990/mês, ativa e sem data de fim) recebia `pro = false`, e o
-- middleware mandava toda tela Pro (Inteligência, Aprovações, Governança,
-- Consolidado, Investidores, Meus dashboards, as abas Quant/Decisão/Risco/
-- Autônomo da IA) para `/planos`. Contratar o plano de cima tirava o que o
-- plano do meio dava.
--
-- O que muda: a regra passa a aceitar Pro OU Enterprise. Nada mais — status
-- (`active`/`trial`), a data de fim (`>= hoje`, o dia do fim ainda vale) e a
-- organização ABERTA (`auth_org_id()`) continuam exatamente como na 0027.
-- Starter continua Simples; teste grátis sem plano continua Simples (decisão
-- de produto, não defeito).
--
-- ⚠️ Muda QUEM PODE ABRIR O QUÊ: quem está no Enterprise passa a abrir as
-- telas Pro. É a correção pedida pelo dono (09/10/2026).
--
-- Guarda: `scripts/plano-pro.sql` (CI, banco efêmero), com o teste negativo
-- dentro: a regra antiga plantada tem de reprovar o caso Enterprise.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.meu_plano()
returns table (plano text, status text, expira date, pro boolean, org_id uuid)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(p.name, 'Simples')   as plano,
    coalesce(s.status, 'none')    as status,
    s.current_period_end          as expira,
    (
      coalesce(s.status, 'none') in ('active', 'trial')
      and (coalesce(p.name, '') ilike '%pro%' or coalesce(p.name, '') ilike '%enterprise%')
      and (s.current_period_end is null or s.current_period_end >= current_date)
    )                             as pro,
    o.id                          as org_id
  from public.organizations o
  left join public.subscriptions s on s.org_id = o.id
  left join public.plans p on p.id = s.plan_id
  where o.id = public.auth_org_id();
$$;

revoke execute on function public.meu_plano() from public, anon;
grant execute on function public.meu_plano() to authenticated;
