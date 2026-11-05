-- ═══════════════════════════════════════════════════════════════════════════
-- ESTOQUE BÁSICO — movimentos e saldo (04/11/2026, etapa 1 do plano de estoque)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O produto já tinha "Controla estoque?" e "Estoque inicial", mas o número só
-- era gravado: nada entrava nem saía dele. Esta migration dá ao estoque UMA
-- conta, sem segunda cópia de nenhum fato:
--
--   saldo = estoque inicial            (products.stock_initial, o cadastro)
--         + entradas − saídas manuais  (estoque_movimentos, esta tabela)
--         − quantidade vendida         (sale_items das vendas vivas)
--
-- ⚠️ A VENDA NÃO GRAVA MOVIMENTO. A quantidade vendida já mora em `sale_items`
-- (a morada única da venda, 20260930150000). Copiar essa quantidade para cá,
-- por gatilho, seria a segunda fonte do mesmo fato: editar a venda troca os
-- itens (o velho vai para a lixeira e o novo entra), cancelar muda o status, e
-- cada caminho teria de lembrar de estornar a cópia. Lendo direto da venda,
-- a edição, o cancelamento e a lixeira já devolvem o estoque sozinhos.
--
-- ⚠️ O ESTOQUE INICIAL também não vira movimento: ele continua sendo o campo
-- do cadastro do produto, lido pela mesma conta. Um movimento "inicial" ao
-- lado do campo seria, de novo, o mesmo número em dois lugares.
--
-- ⚠️ MOVIMENTO É FATO: não se edita. Errou, lança o contrário ou manda o
-- movimento para a lixeira (`excluir_logico`), que deixa o evento na trilha.
-- O cliente não tem UPDATE nem DELETE.
--
-- ⚠️ Vendas `cancelada` e `expirada` não tiram do estoque (o produto não saiu).
-- Reembolso e chargeback continuam tirando: a devolução física, quando
-- acontece, é uma entrada com o motivo "Devolução de cliente".
--
-- Quem pode escrever é quem lança (`tem_permissao('lancar')`), como nos
-- cadastros e na compra. A leitura é da empresa aberta (`auth_org_id()`).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. O mínimo do produto ──────────────────────────────────────────────────
alter table public.products
  add column if not exists stock_min numeric(14,3);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_estoque_minimo_nao_negativo') then
    alter table public.products
      add constraint products_estoque_minimo_nao_negativo check (stock_min is null or stock_min >= 0);
  end if;
end $$;

comment on column public.products.stock_min is
  'Estoque mínimo: abaixo dele a aba Estoque avisa a falta. Vazio = sem aviso.';

-- ── 2. Os movimentos manuais ────────────────────────────────────────────────
create table if not exists public.estoque_movimentos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org_id()
    references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  -- A direção vem do tipo e a quantidade é magnitude (a mesma regra de
  -- `amount`/`type` dos lançamentos): uma saída nunca é "entrada negativa".
  tipo text not null,
  quantidade numeric(14,3) not null,
  custo_unitario numeric(14,4),
  data date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  motivo text not null,
  -- De onde o movimento veio. Hoje só a tela; a entrada pela NF-e de compra
  -- (etapa 2) ganha o próprio valor aqui.
  origem text not null default 'manual',
  -- O que a lixeira mostra no lugar do identificador (`lixeira_listar` lê
  -- `description`).
  description text generated always as (
    case tipo when 'entrada' then 'Entrada de estoque' else 'Saída de estoque' end
    || ' · ' || motivo) stored,
  is_sample boolean not null default false,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  excluido_em timestamptz,
  excluido_por uuid,
  excluido_motivo text,
  constraint estoque_movimentos_tipo_valido check (tipo in ('entrada', 'saida')),
  constraint estoque_movimentos_quantidade_positiva check (quantidade > 0),
  constraint estoque_movimentos_custo_nao_negativo check (custo_unitario is null or custo_unitario >= 0),
  constraint estoque_movimentos_custo_so_na_entrada check (tipo = 'entrada' or custo_unitario is null),
  constraint estoque_movimentos_motivo_preenchido check (btrim(motivo) <> ''),
  constraint estoque_movimentos_origem_valida check (origem in ('manual'))
);

comment on table public.estoque_movimentos is
  'Entradas e saídas MANUAIS de estoque (compra, ajuste, perda, devolução). A venda não grava aqui: o saldo lê a quantidade vendida direto de sale_items (ver a view estoque_saldos).';

create index if not exists estoque_movimentos_produto_idx
  on public.estoque_movimentos (org_id, product_id, data desc) where excluido_em is null;
create index if not exists estoque_movimentos_lixeira_idx
  on public.estoque_movimentos (org_id, excluido_em desc) where excluido_em is not null;
create index if not exists estoque_movimentos_amostra_idx
  on public.estoque_movimentos (org_id) where is_sample;

-- O produto tem de ser DESTA empresa, estar vivo e controlar estoque. A chave
-- estrangeira sozinha aceitaria o produto de outra empresa; a política de
-- leitura esconderia a recusa atrás de "não encontrado". Por isso a conferência
-- lê o produto sem RLS (security definer) e diz o motivo certo.
create or replace function public.estoque_movimento_confere_produto()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org uuid;
  v_controla boolean;
  v_excluido timestamptz;
begin
  select org_id, track_stock, excluido_em into v_org, v_controla, v_excluido
    from public.products where id = new.product_id;
  if v_org is null or v_org <> new.org_id then
    raise exception 'estoque_produto_da_empresa: o produto não é desta empresa.'
      using errcode = 'foreign_key_violation';
  end if;
  if v_excluido is not null then
    raise exception 'estoque_produto_vivo: o produto está na lixeira.'
      using errcode = 'check_violation';
  end if;
  if not coalesce(v_controla, false) then
    raise exception 'estoque_produto_controla: este produto não controla estoque. Ligue "Controla estoque?" no cadastro dele.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.estoque_movimento_confere_produto() from public, anon, authenticated;

drop trigger if exists estoque_movimento_confere_produto on public.estoque_movimentos;
create trigger estoque_movimento_confere_produto
  before insert on public.estoque_movimentos
  for each row execute function public.estoque_movimento_confere_produto();

drop trigger if exists zz_auditar_estoque_movimentos on public.estoque_movimentos;
create trigger zz_auditar_estoque_movimentos
  after insert or update or delete on public.estoque_movimentos
  for each row execute function public.auditar_escrita();

-- ── 3. Acesso ───────────────────────────────────────────────────────────────
alter table public.estoque_movimentos enable row level security;

-- Sem UPDATE nem DELETE para o cliente: o movimento é fato, e excluir é
-- `excluir_logico` (a lixeira, security definer).
revoke all on table public.estoque_movimentos from public, anon, authenticated;
grant select, insert on table public.estoque_movimentos to authenticated;

drop policy if exists estoque_movimentos_org on public.estoque_movimentos;
create policy estoque_movimentos_org on public.estoque_movimentos
  for all to authenticated
  using (org_id = public.auth_org_id())
  with check (org_id = public.auth_org_id());

drop policy if exists estoque_movimentos_escrita_exige_papel on public.estoque_movimentos;
create policy estoque_movimentos_escrita_exige_papel on public.estoque_movimentos
  as restrictive for all to authenticated
  using (true)
  with check (public.tem_permissao('lancar'));

drop policy if exists estoque_movimentos_esconde_excluido on public.estoque_movimentos;
create policy estoque_movimentos_esconde_excluido on public.estoque_movimentos
  as restrictive for select to authenticated
  using (excluido_em is null);

-- ── 4. O saldo: uma conta só, lida pelo banco ───────────────────────────────
-- `security_invoker`: a view lê com o papel de quem pergunta, então as
-- políticas de products, sale_items, sales_docs e estoque_movimentos valem
-- aqui também. A empresa B não vê o saldo da A pelo mesmo motivo que não vê o
-- produto.
--
-- Custo médio: média ponderada das entradas com custo, contando o estoque
-- inicial pelo custo do cadastro. Sem nenhuma entrada com custo, fica VAZIO
-- (a tela diz por quê), nunca zero.
create or replace view public.estoque_saldos
with (security_invoker = true) as
with mov as (
  select m.product_id,
         sum(m.quantidade) filter (where m.tipo = 'entrada') as entradas,
         sum(m.quantidade) filter (where m.tipo = 'saida') as saidas,
         sum(m.quantidade) filter (where m.tipo = 'entrada' and m.custo_unitario is not null) as qtd_custeada,
         sum(m.quantidade * m.custo_unitario) filter (where m.tipo = 'entrada' and m.custo_unitario is not null) as valor_custeado
    from public.estoque_movimentos m
   where m.excluido_em is null and not m.is_sample
   group by m.product_id
), vend as (
  select i.product_id, sum(i.qty) as vendido
    from public.sale_items i
    join public.sales_docs d on d.id = i.doc_id and d.org_id = i.org_id
   where i.product_id is not null
     and i.excluido_em is null and d.excluido_em is null
     and not i.is_sample and not d.is_sample
     and d.kind = 'venda'
     and coalesce(d.status, '') not in ('cancelada', 'expirada')
   group by i.product_id
), base as (
  select p.org_id, p.id as product_id, p.name, p.sku, u.abbrev as unidade,
         coalesce(p.stock_initial, 0) as inicial,
         coalesce(m.entradas, 0) as entradas,
         coalesce(m.saidas, 0) as saidas,
         coalesce(v.vendido, 0) as vendido,
         p.stock_min as minimo,
         coalesce(m.qtd_custeada, 0)
           + case when p.cost_price is not null then coalesce(p.stock_initial, 0) else 0 end as qtd_custo,
         coalesce(m.valor_custeado, 0)
           + case when p.cost_price is not null then coalesce(p.stock_initial, 0) * p.cost_price else 0 end as valor_custo
    from public.products p
    left join public.units u on u.id = p.unit_id
    left join mov m on m.product_id = p.id
    left join vend v on v.product_id = p.id
   where p.track_stock and p.excluido_em is null
)
select org_id, product_id, name, sku, unidade, inicial, entradas, saidas, vendido,
       (inicial + entradas - saidas - vendido)::numeric(14,3) as saldo,
       minimo,
       case when qtd_custo > 0 then round(valor_custo / qtd_custo, 4) end as custo_medio
  from base;

comment on view public.estoque_saldos is
  'Saldo de estoque por produto: inicial + entradas − saídas − vendido. A única conta do saldo; nenhuma tela soma movimento por conta própria.';

revoke all on table public.estoque_saldos from public, anon;
grant select on table public.estoque_saldos to authenticated;
