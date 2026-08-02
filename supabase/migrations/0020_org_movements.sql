-- 0020 — Lançamentos por organização (consolidação multiempresa de verdade).
--
-- O `org_consolidado` (0013) devolve TOTAIS por organização — serve para o
-- painel de posição, mas não para a DRE/DFC Multiempresas, que precisa
-- classificar lançamento a lançamento na cascata. Sem os movimentos, a tela só
-- sabia consolidar a organização ativa.
--
-- ⚠️ GERADA COMO ARQUIVO — aplicar ao remoto. Enquanto não for aplicada, a tela
-- cai no comportamento anterior (organização ativa) e diz isso ao usuário.

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

-- Anônimo nunca: estas funções atravessam RLS por desenho.
revoke all on function public.org_movements(date, date) from anon;
revoke all on function public.org_balances() from anon;
grant execute on function public.org_movements(date, date) to authenticated;
grant execute on function public.org_balances() to authenticated;
