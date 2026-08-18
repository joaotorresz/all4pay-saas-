-- ═══════════════════════════════════════════════════════════════════════════
-- ETAPA D — O RELÓGIO DA ASSINATURA E O BLOQUEIO SUAVE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ **O QUE A MEDIÇÃO DE 18/08 ACHOU.** 16 organizações; **2** com assinatura;
-- **14 com NENHUMA linha** — nem trial. Não é que o teste delas venceu: nunca
-- houve relógio. E as duas que existem estão com `current_period_end` NULO, ou
-- seja, sem data de fim também. A coluna existia e estava INERTE — a mesma
-- família do `competence_date` que o DRE não lia.
--
-- Efeito prático: 1.402 dos 1.415 lançamentos (99,1%) estão em organizações
-- que não pagam nada, e a única que paga (R$990/mês) tem ZERO lançamentos.
--
-- Esta migration põe três coisas de pé:
--   1. toda organização NOVA nasce com um teste que TEM data de fim;
--   2. as que já existem ganham o relógio a partir de HOJE (ver o aviso);
--   3. vencido para de ESCREVER — e continua lendo e exportando tudo.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Toda organização nova nasce com teste datado
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.assinatura_inicial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- ⚠️ `on conflict do nothing`: a chave é o `org_id`, e o provisionamento de
  -- signup pode evoluir para criar a assinatura por outro caminho. Um erro
  -- aqui derrubaria o CADASTRO do usuário — a cobrança nunca pode impedir
  -- alguém de entrar.
  insert into public.subscriptions (org_id, status, mrr, started_at, current_period_end)
  values (new.id, 'trial', 0, current_date, current_date + 14)
  on conflict (org_id) do nothing;
  return new;
end;
$$;
revoke all on function public.assinatura_inicial() from public, anon, authenticated;

drop trigger if exists organizations_assinatura_inicial on public.organizations;
create trigger organizations_assinatura_inicial
  after insert on public.organizations
  for each row execute function public.assinatura_inicial();

-- ───────────────────────────────────────────────────────────────────────────
-- 2. As que já existem
-- ───────────────────────────────────────────────────────────────────────────
--
-- ⚠️ **O PRAZO CONTA DE HOJE, NÃO DA CRIAÇÃO — e isto é decisão, não descuido.**
-- Contar dos 14 dias a partir da data de criação deixaria as 16 organizações
-- VENCIDAS no instante do deploy (a mais nova é de 15/06), inclusive a que tem
-- 677 lançamentos. Seria punir o cliente por um defeito nosso: o relógio não
-- existia, e ninguém pode perder o acesso à escrita por causa de um prazo que
-- só passou a existir agora. Todo mundo começa com os 14 dias inteiros.
insert into public.subscriptions (org_id, status, mrr, started_at, current_period_end)
select o.id, 'trial', 0, current_date, current_date + 14
from public.organizations o
where not exists (select 1 from public.subscriptions s where s.org_id = o.id)
on conflict (org_id) do nothing;

-- Trial sem data de fim é trial sem relógio — o defeito que esta migration
-- existe para consertar. Recebe o mesmo prazo dos demais.
update public.subscriptions
   set current_period_end = current_date + 14, started_at = coalesce(started_at, current_date)
 where status = 'trial' and current_period_end is null;

-- ⚠️ **A ASSINATURA `active` SEM DATA DE FIM FICA COMO ESTÁ, de propósito.**
-- Inventar um vencimento para quem paga criaria um bloqueio que o sistema não
-- tem como resolver sozinho: não há integração de pagamento que renove a data.
-- O cliente seria cortado num dia arbitrário por falta de uma engrenagem que
-- não existe. Sem data = não vence. Fica DECLARADO como pendência: enquanto
-- não houver cobrança recorrente de verdade, `active` é permanente.

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Bloqueio suave — a escrita para, a leitura não
-- ───────────────────────────────────────────────────────────────────────────
--
-- ⚠️ **NUNCA APAGAR, NUNCA ESCONDER.** Vencido é quem parou de pagar, não quem
-- parou de existir. Leitura e exportação continuam INTEIRAS — o dado é da
-- empresa, não nosso, e esconder o arquivo de quem atrasou transforma cobrança
-- em sequestro. Quem regulariza volta a escrever no mesmo instante, sem
-- restaurar nada, porque nada foi mexido.
create or replace function public.org_pode_escrever(p_org uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- ⚠️ Sem linha de assinatura ⇒ PODE. A ausência é o defeito que a parte 2
  -- desta migration acabou de corrigir; tratá-la como bloqueio faria o produto
  -- fechar a porta de quem já está dentro, no primeiro deploy.
  select coalesce(
    (
      select case
        when s.status in ('past_due', 'canceled') then false
        when s.current_period_end is null then true
        else s.current_period_end >= current_date
      end
      from public.subscriptions s
      where s.org_id = coalesce(p_org, public.auth_org_id())
    ),
    true
  );
$$;
revoke all on function public.org_pode_escrever(uuid) from public, anon;
grant execute on function public.org_pode_escrever(uuid) to authenticated;

-- ⚠️ RESTRITIVA: permissiva só AMPLIA (soma por OU); restritiva é a única que
-- TIRA. Ela se soma por E às políticas de organização e de papel que já existem.
--
-- ⚠️ E só nas tabelas que carregam DINHEIRO. `org_state` fica de fora de
-- propósito: ali moram preferência de tela e estado de interface, e travá-lo
-- faria o app parecer QUEBRADO em vez de vencido — o oposto de uma mensagem
-- que explica o que aconteceu.
drop policy if exists movements_escrita_exige_assinatura on public.movements;
create policy movements_escrita_exige_assinatura on public.movements
  as restrictive for all to authenticated
  using (true)
  with check (public.org_pode_escrever());

-- `with check` cobre INSERT e UPDATE; DELETE precisa da sua própria, senão
-- quem não pode escrever ainda poderia APAGAR — a forma mais completa de
-- alterar.
drop policy if exists movements_delete_exige_assinatura on public.movements;
create policy movements_delete_exige_assinatura on public.movements
  as restrictive for delete to authenticated
  using (public.org_pode_escrever());

drop policy if exists splits_escrita_exige_assinatura on public.movement_splits;
create policy splits_escrita_exige_assinatura on public.movement_splits
  as restrictive for all to authenticated
  using (true)
  with check (public.org_pode_escrever());
drop policy if exists splits_delete_exige_assinatura on public.movement_splits;
create policy splits_delete_exige_assinatura on public.movement_splits
  as restrictive for delete to authenticated
  using (public.org_pode_escrever());

drop policy if exists sales_docs_escrita_exige_assinatura on public.sales_docs;
create policy sales_docs_escrita_exige_assinatura on public.sales_docs
  as restrictive for all to authenticated
  using (true)
  with check (public.org_pode_escrever());
drop policy if exists sales_docs_delete_exige_assinatura on public.sales_docs;
create policy sales_docs_delete_exige_assinatura on public.sales_docs
  as restrictive for delete to authenticated
  using (public.org_pode_escrever());

drop policy if exists recurrences_escrita_exige_assinatura on public.recurrences;
create policy recurrences_escrita_exige_assinatura on public.recurrences
  as restrictive for all to authenticated
  using (true)
  with check (public.org_pode_escrever());
drop policy if exists recurrences_delete_exige_assinatura on public.recurrences;
create policy recurrences_delete_exige_assinatura on public.recurrences
  as restrictive for delete to authenticated
  using (public.org_pode_escrever());

-- ───────────────────────────────────────────────────────────────────────────
-- 4. A tela do CLIENTE precisa ver o próprio relógio
-- ───────────────────────────────────────────────────────────────────────────
--
-- ⚠️ `subscriptions` tem RLS sem política: só função DEFINER alcança. Sem esta
-- RPC o prazo existiria só no `/admin` — e um prazo que o cliente não vê é um
-- corte que chega de surpresa. `SECURITY DEFINER` escopado à organização ABERTA
-- (`auth_org_id()`), nunca a um id que o cliente escolhe.
create or replace function public.assinatura_da_org()
returns table (
  status text,
  plano text,
  mrr numeric,
  inicio date,
  fim date,
  dias_restantes integer,
  pode_escrever boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(s.status, 'none')                       as status,
    p.name                                           as plano,
    coalesce(s.mrr, 0)                               as mrr,
    s.started_at                                     as inicio,
    s.current_period_end                             as fim,
    (s.current_period_end - current_date)::int       as dias_restantes,
    public.org_pode_escrever(o.id)                   as pode_escrever
  from public.organizations o
  left join public.subscriptions s on s.org_id = o.id
  left join public.plans p on p.id = s.plan_id
  where o.id = public.auth_org_id();
$$;
revoke all on function public.assinatura_da_org() from public, anon;
grant execute on function public.assinatura_da_org() to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. O plano precisa declarar um TETO para "acima do limite" existir
-- ───────────────────────────────────────────────────────────────────────────
--
-- ⚠️ Medido: os três planos têm `features = '{}'`. Sem teto declarado, o alerta
-- "uso acima do limite do plano" não tem com o que comparar — ele seria uma
-- tela que nunca acende, que é pior que não ter a tela. Os números abaixo são
-- decisão COMERCIAL, e ficam aqui para poderem ser mudados num lugar só.
update public.plans set features = jsonb_build_object('limite_lancamentos', 500)   where name = 'Starter'    and features = '{}'::jsonb;
update public.plans set features = jsonb_build_object('limite_lancamentos', 5000)  where name = 'Pro'        and features = '{}'::jsonb;
update public.plans set features = jsonb_build_object('limite_lancamentos', null)  where name = 'Enterprise' and features = '{}'::jsonb;

-- ───────────────────────────────────────────────────────────────────────────
-- 6. O painel do administrador precisa do PRAZO e do TETO para reconciliar
-- ───────────────────────────────────────────────────────────────────────────
--
-- ⚠️ **`coalesce(s.status, 'trial')` ESTAVA INVENTANDO UM TESTE QUE NÃO EXISTIA.**
-- Medido: 14 das 16 organizações não tinham linha em `subscriptions`, e o painel
-- mostrava as 14 como "trial". Não era arredondamento: era o `/admin` afirmando
-- que havia um teste em curso — com prazo, com conversão esperada — onde não
-- havia relação comercial nenhuma. É a mesma família do zero que ocupa o lugar
-- da ausência (ONDA 4): a ausência tem de aparecer como ausência.
--
-- Depois da parte 2 desta migration toda org TEM linha, então na prática o
-- `coalesce` não pega mais ninguém — e é justamente por isso que ele não pode
-- ficar: no dia em que uma org nascer sem assinatura (defeito no gatilho), o
-- painel voltaria a dizer "trial" em vez de acender o alerta.
drop function if exists public.admin_orgs();
create or replace function public.admin_orgs()
returns table (
  org_id uuid, nome text, criado timestamptz, membros int,
  plano text, status text, mrr numeric, expira date,
  limite_lancamentos int, ultimo_mov date, movimentos int
)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  return query
    select o.id, o.name, o.created_at,
      (select count(*)::int from public.organization_members m where m.org_id = o.id),
      coalesce(p.name, '—'),
      coalesce(s.status, 'none'),
      coalesce(s.mrr, 0),
      s.current_period_end,
      nullif(p.features->>'limite_lancamentos', '')::int,
      (select max(mv.due_date) from public.movements mv where mv.org_id = o.id),
      (select count(*)::int from public.movements mv where mv.org_id = o.id)
    from public.organizations o
    left join public.subscriptions s on s.org_id = o.id
    left join public.plans p on p.id = s.plan_id
    order by o.created_at desc;
end; $$;
revoke all on function public.admin_orgs() from public, anon;
grant execute on function public.admin_orgs() to authenticated;
