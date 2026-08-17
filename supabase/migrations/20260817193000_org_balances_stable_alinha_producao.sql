-- ═══════════════════════════════════════════════════════════════════════════
-- A4P-076 — `org_balances()` está STABLE em produção, VOLATILE no repositório
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A guarda de objetos (`npm run objetos`) acusou DERIVA em `funcao:org_balances()`:
-- o md5 de (secdef · search_path · volatilidade) diverge entre o banco efêmero
-- (o que as migrations produzem) e o retrato de produção.
--
-- Medido em 17/08 lendo o catálogo de produção direto:
--   produção:  prosecdef=t · proconfig={search_path=public} · provolatile='s' (STABLE)
--   migration 0020: `language sql` SEM palavra de volatilidade → default VOLATILE ('v')
--
-- Ou seja: alguém tornou a função STABLE em produção sem passar por migration —
-- exatamente a classe de deriva que o A4P-076 existe para tornar visível. STABLE
-- é a escolha CORRETA para uma função `security definer` que só LÊ (o planejador
-- pode cachear o resultado dentro da consulta), então produção está certa e o
-- repositório é que estava atrás.
--
-- Esta migration ALINHA o repositório à produção: recria a função idêntica, com
-- `stable` declarado. Em produção é no-op (já é STABLE); no banco efêmero passa
-- a produzir a mesma assinatura, e a DERIVA fecha.

-- Saldo por organização, para o Saldo Inicial do DFC consolidado.
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

-- Mantém o fechamento de privilégio da 0020 (revoga de PUBLIC/anon; só authenticated executa).
revoke all on function public.org_balances() from public, anon;
grant execute on function public.org_balances() to authenticated;
