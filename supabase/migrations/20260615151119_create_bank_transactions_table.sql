-- Open Finance / Pluggy: transações; movement_id liga ao hub (2A)
create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default auth_org_id() references public.organizations(id) on delete cascade,
  account_id uuid references public.bank_accounts(id) on delete cascade,
  pluggy_transaction_id text not null,
  amount numeric,
  currency text default 'BRL',
  date timestamptz,
  description text,
  category text,
  type text,
  movement_id uuid references public.movements(id) on delete set null,
  raw jsonb,
  created_at timestamptz not null default now()
);

-- idempotência do webhook: cada transação do Pluggy entra uma vez por org
create unique index if not exists bank_transactions_txn_uniq
  on public.bank_transactions (org_id, pluggy_transaction_id);
create index if not exists bank_transactions_account_idx
  on public.bank_transactions (account_id);

alter table public.bank_transactions enable row level security;
do $$ begin
  if not exists (select 1 from pg_policy
    where polname='org rw bank_transactions' and polrelid='public.bank_transactions'::regclass) then
    create policy "org rw bank_transactions" on public.bank_transactions
      for all using (org_id = auth_org_id()) with check (org_id = auth_org_id());
  end if;
end $$;

-- idempotência do ETL ao hub: movements vindos do OF (espelha o padrão rec:%)
create unique index if not exists movements_pluggy_ref_uniq
  on public.movements (org_id, reference_code)
  where reference_code like 'pluggy:%';