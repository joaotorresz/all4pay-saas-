-- ═══════════════════════════════════════════════════════════════════════════
-- O CONSOLIDADO LÊ O PERÍODO INTEIRO — e só o que é dado real (revisão CAMP-B)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O CAMP-B passou a montar a tela de Consolidado (e as eliminações
-- intercompany) sobre `org_movements`, somando por VENCIMENTO dentro do
-- período — a mesma regra de `org_consolidado`. Só que `org_movements` recorta
-- por OUTRA data: `coalesce(paid_date, due_date) between p_de and p_ate`.
--
-- ⚠️ MEDIDO no banco local (transação desfeita), período setembro:
--   · título que VENCE em 10/09 e foi PAGO em 02/10 → não vinha (o recorte olha
--     o pagamento). Somava em `org_consolidado`, sumia da tela nova: o
--     consolidado de setembro saía MENOR que a soma das empresas, com a mesma
--     cara de completo — o número que vai ao banco pedir crédito.
--   · o DRE multiempresas (competência = vencimento) tinha o mesmo buraco
--     desde a 0020, calado.
--
-- ⚠️ E as duas funções são SECURITY DEFINER: a política restritiva que esconde
-- a LIXEIRA (`excluido_em`) não vale dentro delas, e o filtro de AMOSTRA
-- (`is_sample`, que o produto aplica por omissão em toda leitura) também não.
-- Uma venda excluída (exclusão lógica, CAMP-B/morada única) e o seed do
-- "Carregar amostra" continuavam somando no consolidado de quem os apagou.
--
-- O que muda:
--  · `org_movements` devolve o lançamento cujo VENCIMENTO **ou** PAGAMENTO cai
--    no período — o superconjunto que serve aos dois regimes (o DRE filtra por
--    vencimento, o DFC por pagamento, cada um sobre o que precisa). Nada que
--    vinha antes deixa de vir, exceto lixeira e amostra;
--  · as duas funções deixam de fora `excluido_em is not null` e `is_sample`.
--
-- ⚠️ NÃO MUDA QUEM PODE CHAMAR O QUÊ: as duas funções já existiam, continuam
-- SECURITY DEFINER com o MESMO escopo (organizações em que `auth.uid()` é
-- membro), mesmo search_path, mesma volatilidade (STABLE, alinhada a produção
-- pela 20260817193000); `create or replace` preserva as concessões, e os
-- revoke/grant abaixo só repetem as que já valem.

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
    -- A lixeira e a amostra: a política restritiva não alcança uma função
    -- DEFINER, então o filtro é dito aqui.
    and m.excluido_em is null
    and not m.is_sample
    -- Vencimento OU pagamento no período: o DRE (competência) precisa do
    -- título que vence no período e foi pago depois; o DFC (caixa), do que foi
    -- pago no período e vencia antes.
    and (m.due_date between p_de and p_ate or m.paid_date between p_de and p_ate)
$$;

revoke all on function public.org_movements(date, date) from public, anon;
grant execute on function public.org_movements(date, date) to authenticated;

create or replace function public.org_consolidado(p_de date, p_ate date)
returns table (org_id uuid, nome text, saldo numeric, receita numeric, despesa numeric, contas int)
language sql security definer stable set search_path = public as $$
  select
    o.id,
    o.name,
    coalesce((select sum(fa.balance) from public.financial_accounts fa where fa.org_id = o.id), 0),
    coalesce((select sum(m.amount) from public.movements m
              where m.org_id = o.id and m.type = 'entrada' and m.status <> 'cancelado'
                and m.excluido_em is null and not m.is_sample
                and m.due_date between p_de and p_ate), 0),
    coalesce((select sum(m.amount) from public.movements m
              where m.org_id = o.id and m.type = 'saida' and m.status <> 'cancelado'
                and m.excluido_em is null and not m.is_sample
                and m.due_date between p_de and p_ate), 0),
    coalesce((select count(*)::int from public.financial_accounts fa where fa.org_id = o.id), 0)
  from public.organizations o
  where o.id in (select om.org_id from public.organization_members om where om.user_id = auth.uid());
$$;

revoke all on function public.org_consolidado(date, date) from public;
revoke execute on function public.org_consolidado(date, date) from anon;
grant execute on function public.org_consolidado(date, date) to authenticated;
