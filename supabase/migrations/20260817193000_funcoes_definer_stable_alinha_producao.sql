-- ═══════════════════════════════════════════════════════════════════════════
-- A4P-076 — `org_balances()` e `org_movements()` são STABLE em produção e
--            VOLATILE no repositório
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A guarda de objetos (`npm run objetos`) acusou DERIVA nas duas: o md5 de
-- (secdef · search_path · volatilidade) diverge entre o banco efêmero (o que as
-- migrations produzem) e o retrato de produção.
--
-- Medido em 17/08 lendo o catálogo de produção direto:
--   produção:  prosecdef=t · proconfig={search_path=public} · provolatile='s' (STABLE)
--   migration 0020: `language sql` SEM palavra de volatilidade → default VOLATILE ('v')
--
-- Ou seja: alguém tornou as duas STABLE em produção sem passar por migration —
-- exatamente a classe de deriva que o A4P-076 existe para tornar visível. STABLE
-- é a escolha CORRETA para uma função `security definer` que só LÊ (o planejador
-- pode reusar o resultado dentro da mesma consulta), então produção está certa e
-- o repositório é que estava atrás.
--
-- ⚠️ **AS DUAS, e a segunda só apareceu por eu ter lido uma lista TRUNCADA.**
-- A primeira versão desta migration corrigia só `org_balances`, porque foi a
-- única que eu vi no relatório da guarda — que imprime 25 itens e resume o resto
-- em "… e mais N". Concluí "org_balances é a única deriva real" a partir de uma
-- saída cortada. Com o ruído removido, a guarda mostrou `org_movements` na
-- mesma condição. A varredura completa (todas as funções que produção tem como
-- STABLE, conferidas uma a uma contra o `create` das migrations) confirma que
-- são exatamente estas duas — as outras 15 já declaram `stable`.
--
-- Esta migration ALINHA o repositório à produção: recria as duas idênticas, com
-- `stable` declarado. Em produção é no-op (já são STABLE); no banco efêmero
-- passam a produzir a mesma assinatura, e a DERIVA fecha.

-- Lançamentos por organização (consolidação multiempresa).
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

-- Mantém o fechamento de privilégio da 0020 (revoga de PUBLIC/anon; só
-- `authenticated` executa). `create or replace` preserva os grants existentes,
-- mas repeti-los aqui torna a migration correta sozinha, aplicada em qualquer
-- ordem sobre um banco novo.
revoke all on function public.org_movements(date, date) from public, anon;
revoke all on function public.org_balances() from public, anon;
grant execute on function public.org_movements(date, date) to authenticated;
grant execute on function public.org_balances() to authenticated;
