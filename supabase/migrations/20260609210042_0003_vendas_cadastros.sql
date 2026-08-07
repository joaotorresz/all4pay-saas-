-- ============================================================
--  all4pay — Vendas/Compras + cadastros (produtos, serviços,
--  marcas, unidades, vendedores). Extends 0002.
--  PROPOSAL — review before applying. Not yet run on remote.
-- ============================================================

create type sale_doc_kind as enum ('venda', 'compra', 'orcamento');
create type item_kind      as enum ('produto', 'servico');

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  name text not null,            -- ex: Quilograma
  abbrev text not null,          -- ex: kg
  created_at timestamptz not null default now()
);

create table public.salespeople (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text,
  category_id uuid references public.categories (id) on delete set null,
  unit_id uuid references public.units (id) on delete set null,
  brand_id uuid references public.brands (id) on delete set null,
  sale_price numeric(14, 2) not null default 0,
  cost_price numeric(14, 2),
  track_stock boolean not null default false,
  stock_initial numeric(14, 3),
  created_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  category_id uuid references public.categories (id) on delete set null,
  unit_id uuid references public.units (id) on delete set null,
  price numeric(14, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table public.sales_docs (
  id uuid primary key default gen_random_uuid(),
  kind sale_doc_kind not null,
  item_kind item_kind not null,
  party_id uuid references public.parties (id) on delete set null,
  salesperson_id uuid references public.salespeople (id) on delete set null,
  cost_center_id uuid references public.cost_centers (id) on delete set null,
  doc_date date not null,
  validity date,                 -- orçamento
  subtotal numeric(14, 2) not null default 0,
  discount numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  status text not null default 'aberto',  -- aberto | orcamento | faturado
  notes text,
  created_at timestamptz not null default now()
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references public.sales_docs (id) on delete cascade,
  product_id uuid references public.products (id),
  service_id uuid references public.services (id),
  description text,
  qty numeric(14, 3) not null default 1,
  unit_price numeric(14, 2) not null default 0,
  discount numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0
);
create index sale_items_doc_idx on public.sale_items (doc_id);

-- ---- RLS ----
alter table public.brands      enable row level security;
alter table public.units       enable row level security;
alter table public.salespeople enable row level security;
alter table public.products    enable row level security;
alter table public.services    enable row level security;
alter table public.sales_docs  enable row level security;
alter table public.sale_items  enable row level security;

create policy "auth rw brands"      on public.brands      for all to authenticated using (true) with check (true);
create policy "auth rw units"       on public.units       for all to authenticated using (true) with check (true);
create policy "auth rw salespeople" on public.salespeople for all to authenticated using (true) with check (true);
create policy "auth rw products"    on public.products    for all to authenticated using (true) with check (true);
create policy "auth rw services"    on public.services    for all to authenticated using (true) with check (true);
create policy "auth rw sales_docs"  on public.sales_docs  for all to authenticated using (true) with check (true);
create policy "auth rw sale_items"  on public.sale_items  for all to authenticated using (true) with check (true);
