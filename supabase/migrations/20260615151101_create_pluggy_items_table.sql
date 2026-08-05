-- Open Finance / Pluggy: vínculo obrigatório (a doc exige rastrear o item_id)
create table if not exists public.pluggy_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default auth_org_id() references public.organizations(id) on delete cascade,
  pluggy_item_id text not null,
  connector_id integer,
  connector_name text,
  client_user_id text,
  status text,
  status_detail jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- idempotência: um item do Pluggy aparece uma vez por org
create unique index if not exists pluggy_items_item_uniq
  on public.pluggy_items (org_id, pluggy_item_id);

alter table public.pluggy_items enable row level security;
do $$ begin
  if not exists (select 1 from pg_policy
    where polname='org rw pluggy_items' and polrelid='public.pluggy_items'::regclass) then
    create policy "org rw pluggy_items" on public.pluggy_items
      for all using (org_id = auth_org_id()) with check (org_id = auth_org_id());
  end if;
end $$;