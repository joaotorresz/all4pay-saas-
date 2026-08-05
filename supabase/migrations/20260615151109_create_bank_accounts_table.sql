-- Open Finance / Pluggy: contas trazidas via OF
create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default auth_org_id() references public.organizations(id) on delete cascade,
  item_id uuid references public.pluggy_items(id) on delete cascade,
  pluggy_account_id text not null,
  type text,
  subtype text,
  name text,
  number text,
  balance numeric,
  currency text default 'BRL',
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists bank_accounts_acct_uniq
  on public.bank_accounts (org_id, pluggy_account_id);

alter table public.bank_accounts enable row level security;
do $$ begin
  if not exists (select 1 from pg_policy
    where polname='org rw bank_accounts' and polrelid='public.bank_accounts'::regclass) then
    create policy "org rw bank_accounts" on public.bank_accounts
      for all using (org_id = auth_org_id()) with check (org_id = auth_org_id());
  end if;
end $$;