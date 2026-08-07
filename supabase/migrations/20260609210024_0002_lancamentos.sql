-- ============================================================
--  all4pay — Lançamentos (Receita/Despesa) + cadastros base
--  Extends the financial overview schema (0001) to back the
--  "Novo registro" forms, starting with Receita (the mold).
--  Apply with the Supabase CLI / dashboard — review before running.
-- ============================================================

create type category_kind   as enum ('receita', 'despesa');
create type payment_method  as enum ('pix', 'boleto', 'cartao', 'dinheiro', 'transferencia');
create type recurrence_freq as enum ('semanal', 'mensal', 'anual');
create type party_type      as enum ('pf', 'pj');

-- Categorias (de receita ou de despesa)
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  kind       category_kind not null,
  name       text not null,
  parent_id  uuid references public.categories (id) on delete set null,
  active      boolean not null default true,
  created_at timestamptz not null default now()
);
create index categories_kind_idx on public.categories (kind) where active;

-- Centros de custo
create table public.cost_centers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Parties: cliente / fornecedor / transportadora (unificados por flags)
create table public.parties (
  id          uuid primary key default gen_random_uuid(),
  type        party_type not null,
  name        text not null,                 -- nome ou razão social
  doc         text,                          -- CPF/CNPJ como digitado
  -- DEDUP: somente dígitos, STORED, com índice único parcial
  doc_digits  text generated always as (regexp_replace(coalesce(doc, ''), '\D', '', 'g')) stored,
  email       text,
  phone       text,
  zip         text,
  street      text,
  number      text,
  complement  text,
  district    text,
  city        text,
  state       text,
  is_customer boolean not null default false,
  is_supplier boolean not null default false,
  is_carrier  boolean not null default false,
  antt        text,                          -- somente transportadora
  created_at  timestamptz not null default now()
);
create unique index parties_doc_unique on public.parties (doc_digits) where doc_digits <> '';
create index parties_customer_idx on public.parties (name) where is_customer;
create index parties_supplier_idx on public.parties (name) where is_supplier;

-- Extensões em movements (um lançamento)
alter table public.movements
  add column competence_date  date,
  add column party_id         uuid references public.parties (id)      on delete set null,
  add column category_id      uuid references public.categories (id)   on delete set null,
  add column cost_center_id   uuid references public.cost_centers (id) on delete set null,
  add column payment_method   payment_method,
  add column reference_code   text,
  add column nsu              text,
  add column group_id         uuid,          -- agrupa parcelas / repetições
  add column installment_no    int,
  add column installment_total int;
create index movements_group_idx on public.movements (group_id);

-- Rateio (split por categoria / centro de custo)
create table public.movement_splits (
  id             uuid primary key default gen_random_uuid(),
  movement_id    uuid not null references public.movements (id) on delete cascade,
  category_id    uuid references public.categories (id),
  cost_center_id uuid references public.cost_centers (id),
  percent        numeric(5, 2),
  amount         numeric(14, 2)
);
create index movement_splits_movement_idx on public.movement_splits (movement_id);

-- Recorrência ("Repetir lançamento" e Contrato)
create table public.recurrences (
  id             uuid primary key default gen_random_uuid(),
  party_id       uuid references public.parties (id),
  type           movement_type not null,
  description    text not null,
  amount         numeric(14, 2) not null,
  freq           recurrence_freq not null,
  start_date     date not null,
  end_date       date,
  category_id    uuid references public.categories (id),
  cost_center_id uuid references public.cost_centers (id),
  due_day        int,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

-- ---- RLS: enable + authenticated read/write (tighten per tenant later) ----
alter table public.categories      enable row level security;
alter table public.cost_centers    enable row level security;
alter table public.parties         enable row level security;
alter table public.movement_splits enable row level security;
alter table public.recurrences     enable row level security;

create policy "auth read categories"  on public.categories      for select to authenticated using (true);
create policy "auth read cost_centers" on public.cost_centers    for select to authenticated using (true);
create policy "auth read parties"      on public.parties         for select to authenticated using (true);
create policy "auth rw splits"         on public.movement_splits for all    to authenticated using (true) with check (true);
create policy "auth rw recurrences"    on public.recurrences     for all    to authenticated using (true) with check (true);
create policy "auth write parties"     on public.parties         for all    to authenticated using (true) with check (true);
create policy "auth write categories"  on public.categories      for all    to authenticated using (true) with check (true);
create policy "auth write cost_centers" on public.cost_centers   for all    to authenticated using (true) with check (true);

-- movements: 0001 enabled read; add insert/update for the forms.
create policy "auth write movements" on public.movements for all to authenticated using (true) with check (true);
