-- ============================================================
--  all4pay — Visão Geral (financial overview) schema
--  Tables that back the dashboard widgets. Apply with the
--  Supabase CLI / dashboard. The app aggregates these rows; set
--  NEXT_PUBLIC_ALL4PAY_DEMO=false once data exists to go live.
-- ============================================================

create type movement_type as enum ('entrada', 'saida');
create type movement_status as enum ('pendente', 'pago', 'cancelado');

-- Bank / payment accounts the company holds money in.
create table if not exists public.financial_accounts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  bank        text not null,             -- brand key: itau | bradesco | nubank | inter ...
  balance     numeric(14, 2) not null default 0,
  created_at  timestamptz not null default now()
);

-- Cash movements (receivables = entrada, payables = saida).
create table if not exists public.movements (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.financial_accounts (id) on delete cascade,
  type        movement_type not null,
  status      movement_status not null default 'pendente',
  category    text,                       -- 'venda' feeds the sales chart
  amount      numeric(14, 2) not null check (amount >= 0),
  due_date    date not null,
  paid_date   date,
  reconciled  boolean not null default false,
  description text,
  created_at  timestamptz not null default now()
);

-- Indexes for the widget queries.
create index if not exists movements_type_status_due_idx
  on public.movements (type, status, due_date);
create index if not exists movements_paid_date_idx
  on public.movements (paid_date) where status = 'pago';
create index if not exists movements_sales_idx
  on public.movements (due_date) where type = 'entrada' and category = 'venda';
create index if not exists movements_unreconciled_idx
  on public.movements (account_id) where reconciled = false;

-- Row Level Security: enable and allow authenticated reads.
-- Tighten with an org/tenant scope before multi-tenant production use.
alter table public.financial_accounts enable row level security;
alter table public.movements enable row level security;

create policy "authenticated read accounts"
  on public.financial_accounts for select
  to authenticated using (true);

create policy "authenticated read movements"
  on public.movements for select
  to authenticated using (true);
