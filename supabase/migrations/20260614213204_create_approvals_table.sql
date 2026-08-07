-- Onda 1.2 — persistência do funil PAGAR: tabela de aprovações (alçada)
do $$ begin
  if not exists (select 1 from pg_type where typname = 'approval_status') then
    create type approval_status as enum ('pending','approved','rejected','returned');
  end if;
end $$;

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default auth_org_id() references public.organizations(id) on delete cascade,
  movement_id uuid references public.movements(id) on delete set null,
  requester_id uuid,
  approver_id uuid,
  amount numeric not null default 0,
  category_id uuid,
  cost_center_id uuid,
  reason text,
  justification text,
  status approval_status not null default 'pending',
  level int not null default 1,
  levels_required int not null default 1,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.approvals enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policy
    where polname = 'org rw approvals' and polrelid = 'public.approvals'::regclass
  ) then
    create policy "org rw approvals" on public.approvals
      for all using (org_id = auth_org_id()) with check (org_id = auth_org_id());
  end if;
end $$;

create index if not exists approvals_org_idx on public.approvals(org_id);
create index if not exists approvals_movement_idx on public.approvals(movement_id);