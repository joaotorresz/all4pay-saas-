-- 0008_open_finance.sql
-- Versiona o schema do Open Finance (Pluggy) que hoje só existe no banco remoto
-- (aplicado à mão). Idempotente (IF NOT EXISTS) — seguro no remoto atual e num
-- ambiente de produção limpo. Multi-tenant: org_id default auth_org_id() + RLS,
-- no mesmo padrão das migrations 0005-0007.

-- ---------- pluggy_items (conexões bancárias) ----------
create table if not exists public.pluggy_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org_id(),
  pluggy_item_id text not null,
  connector_id integer,
  connector_name text,
  client_user_id text,
  status text,
  status_detail text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, pluggy_item_id)
);

-- ---------- bank_accounts (contas vindas do Open Finance) ----------
create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org_id(),
  item_id uuid references public.pluggy_items (id) on delete cascade,
  pluggy_account_id text not null,
  type text,
  subtype text,
  name text,
  number text,
  balance numeric,
  currency text default 'BRL',
  raw jsonb,
  -- correlação com a conta financeira interna + origem do saldo (Fase 1 do app)
  linked_financial_account_id uuid references public.financial_accounts (id) on delete set null,
  balance_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, pluggy_account_id)
);

-- ---------- bank_transactions (extrato OF) ----------
create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org_id(),
  account_id uuid references public.bank_accounts (id) on delete cascade,
  pluggy_transaction_id text not null,
  amount numeric,
  currency text default 'BRL',
  date date,
  description text,
  category text,
  type text,
  raw jsonb,
  -- movement gerado (FK frouxa: ao apagar o movement, mantém a linha do extrato)
  movement_id uuid references public.movements (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, pluggy_transaction_id)
);

-- ---------- colunas no movements usadas pelo ETL/fila de confirmação ----------
alter table public.movements add column if not exists reference_code text;
alter table public.movements add column if not exists review_status text;

-- Idempotência do ETL: índices ÚNICOS PARCIAIS por origem (rec:% e pluggy:%).
-- (movements NÃO tem unique total em reference_code — por isso é parcial.)
create unique index if not exists movements_pluggy_ref_uniq
  on public.movements (org_id, reference_code)
  where reference_code like 'pluggy:%';
create unique index if not exists movements_rec_ref_uniq
  on public.movements (org_id, reference_code)
  where reference_code like 'rec:%';

-- ---------- RLS (isolamento por organização) ----------
alter table public.pluggy_items enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.bank_transactions enable row level security;

drop policy if exists pluggy_items_org on public.pluggy_items;
create policy pluggy_items_org on public.pluggy_items
  using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());

drop policy if exists bank_accounts_org on public.bank_accounts;
create policy bank_accounts_org on public.bank_accounts
  using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());

drop policy if exists bank_transactions_org on public.bank_transactions;
create policy bank_transactions_org on public.bank_transactions
  using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());

create index if not exists bank_accounts_org_idx on public.bank_accounts (org_id);
create index if not exists bank_transactions_org_idx on public.bank_transactions (org_id);
create index if not exists bank_transactions_acc_idx on public.bank_transactions (account_id);
