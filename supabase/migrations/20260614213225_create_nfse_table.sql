-- Onda 1.2 — persistência do funil RECEBER: tabela de NFS-e
-- movement_id + recurrence_id -> ligam a nota à receita/fatura (resolve N2: evita dupla contagem)
do $$ begin
  if not exists (select 1 from pg_type where typname = 'nfse_status') then
    create type nfse_status as enum ('rascunho','processando','autorizada','rejeitada','cancelada','substituida');
  end if;
end $$;

create table if not exists public.nfse (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default auth_org_id() references public.organizations(id) on delete cascade,
  tomador_id uuid references public.parties(id) on delete set null,
  movement_id uuid references public.movements(id) on delete set null,
  recurrence_id uuid references public.recurrences(id) on delete set null,
  service_code text,
  description text,
  amount numeric not null default 0,
  iss_rate numeric,
  iss_retained boolean not null default false,
  taxes jsonb not null default '{}'::jsonb,
  municipality text,
  competence date,
  await_payment boolean not null default false,
  numero text,
  codigo_verificacao text,
  status nfse_status not null default 'rascunho',
  created_at timestamptz not null default now()
);

alter table public.nfse enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policy
    where polname = 'org rw nfse' and polrelid = 'public.nfse'::regclass
  ) then
    create policy "org rw nfse" on public.nfse
      for all using (org_id = auth_org_id()) with check (org_id = auth_org_id());
  end if;
end $$;

create index if not exists nfse_org_idx on public.nfse(org_id);
create index if not exists nfse_movement_idx on public.nfse(movement_id);
create index if not exists nfse_recurrence_idx on public.nfse(recurrence_id);