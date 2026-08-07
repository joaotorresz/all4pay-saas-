-- Onda 1.2 — persistência do funil PAGAR: tabela de reembolsos
-- colaborador_id -> parties (resolve N3: colaborador como party real, não "colab:Nome")
-- approval_id -> approvals (reusa o motor de alçada)
do $$ begin
  if not exists (select 1 from pg_type where typname = 'reembolso_status') then
    create type reembolso_status as enum ('rascunho','solicitado','em_aprovacao','aprovado','rejeitado','pago');
  end if;
end $$;

create table if not exists public.reembolsos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default auth_org_id() references public.organizations(id) on delete cascade,
  colaborador_id uuid references public.parties(id) on delete set null,
  approval_id uuid references public.approvals(id) on delete set null,
  movement_id uuid references public.movements(id) on delete set null,
  itens jsonb not null default '[]'::jsonb,
  amount numeric not null default 0,
  pix_key text,
  status reembolso_status not null default 'rascunho',
  created_at timestamptz not null default now()
);

alter table public.reembolsos enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policy
    where polname = 'org rw reembolsos' and polrelid = 'public.reembolsos'::regclass
  ) then
    create policy "org rw reembolsos" on public.reembolsos
      for all using (org_id = auth_org_id()) with check (org_id = auth_org_id());
  end if;
end $$;

create index if not exists reembolsos_org_idx on public.reembolsos(org_id);
create index if not exists reembolsos_colaborador_idx on public.reembolsos(colaborador_id);