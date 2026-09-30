-- ═══════════════════════════════════════════════════════════════════════════
-- A VENDA GANHA UMA MORADA SÓ — `sales_docs` (30/09/2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A venda existia em TRÊS lugares com escritores independentes:
--   · `a4p_vendas_docs` (navegador / org_state) — a tela "Nova venda";
--   · `sales_docs` + `sale_items`               — o lançamento rápido;
--   · o recebível em `movements`                 — o dinheiro.
-- A lista de vendas somava o navegador e o DRE somava `movements`: dois
-- faturamentos com o mesmo rótulo. Uma venda do lançamento rápido não aparecia
-- na lista, nas notas nem nos impostos; editar uma venda em produção não
-- mexia no título, e excluir deixava o recebível órfão.
--
-- A regra da casa: a morada que grava DINHEIRO é a do banco. `sales_docs`
-- passa a carregar tudo o que a tela "Nova venda" coleta, e o título passa a
-- apontar para o documento por CHAVE ESTRANGEIRA — não mais pela convenção de
-- `group_id`, que nada no banco garantia.

-- ── 1. O documento carrega o que a tela coleta ──────────────────────────────
alter table public.sales_docs
  add column if not exists numero          text,
  add column if not exists competence_date date,
  add column if not exists due_date        date,
  add column if not exists account_id      uuid references public.financial_accounts(id) on delete set null,
  add column if not exists status_nf       text not null default 'a_emitir',
  add column if not exists numero_nf       text,
  -- ⚠️ `detalhe` guarda o que é da TELA e não é consultado pelo banco: taxas
  -- com fornecedor, rateios, plataforma, método, textos. As colunas acima são
  -- o que alguém filtra, ordena ou soma — essas não moram no jsonb.
  add column if not exists detalhe         jsonb not null default '{}'::jsonb;

comment on column public.sales_docs.detalhe is
  'Campos da venda que só a tela lê (taxas com fornecedor, rateios, plataforma, método, textos). O que se filtra ou soma tem coluna própria.';

-- Número único por empresa entre as vendas vivas — é ele que aparece na nota,
-- na cobrança e na conversa com o cliente.
create unique index if not exists sales_docs_numero_unico
  on public.sales_docs (org_id, numero)
  where numero is not null and excluido_em is null;

-- ── 2. O título aponta para o documento que o originou ──────────────────────
alter table public.movements
  add column if not exists sale_doc_id uuid references public.sales_docs(id) on delete restrict;

create index if not exists movements_sale_doc_idx
  on public.movements (sale_doc_id) where sale_doc_id is not null;

comment on column public.movements.sale_doc_id is
  'Venda que originou este título. on delete restrict: um documento com título não some calado — a exclusão da venda passa pela exclusão lógica dos dois.';

-- ── 3. Os títulos já ligados por convenção passam a ter a chave ─────────────
-- Só casa quando o `group_id` é o id de um documento da MESMA empresa. Um
-- `group_id` de transferência (dois lados de um fato) nunca é id de documento.
update public.movements m
   set sale_doc_id = d.id
  from public.sales_docs d
 where m.group_id = d.id
   and m.org_id = d.org_id
   and m.sale_doc_id is null;
