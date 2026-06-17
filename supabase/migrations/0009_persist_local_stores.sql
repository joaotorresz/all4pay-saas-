-- 0009_persist_local_stores.sql
-- Versiona (e prepara a migração de) os dados que hoje vivem só em localStorage:
-- aprovações/alçada, reembolsos, NFS-e, taxas POS e perfil da empresa. Também
-- liga a Governança aos membros reais (organization_members). Idempotente.
-- Multi-tenant: org_id default auth_org_id() + RLS (padrão 0005-0007).

-- ---------- Governança real: perfil/permissões por membro ----------
alter table public.organization_members add column if not exists display_name text;
alter table public.organization_members add column if not exists email text;
alter table public.organization_members add column if not exists permissions jsonb not null default '{}'::jsonb;
alter table public.organization_members add column if not exists approval_limit numeric;
alter table public.organization_members add column if not exists can_cancel boolean not null default false;

-- ---------- approvals (gate de alçada) + trilha ----------
create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org_id(),
  movement_id uuid references public.movements (id) on delete set null,
  kind text not null default 'pagamento',          -- pagamento | reembolso
  amount numeric not null default 0,
  status text not null default 'pendente',          -- pendente|aprovado|rejeitado|devolvido
  rule text,                                          -- faixa de alçada aplicada
  requested_by text,
  decided_by text,
  justification text,
  trail jsonb not null default '[]'::jsonb,           -- passos (aprovar/rejeitar/devolver)
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- ---------- reimbursements (reembolsos do colaborador) ----------
create table if not exists public.reimbursements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org_id(),
  collaborator text,
  pix_key text,
  items jsonb not null default '[]'::jsonb,           -- itens (com categoria p/ DRE)
  total numeric not null default 0,
  status text not null default 'pendente',
  approval_id uuid references public.approvals (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- nfse (notas fiscais de serviço) ----------
create table if not exists public.nfse (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org_id(),
  movement_id uuid references public.movements (id) on delete set null,
  numero text,
  status text not null default 'emitida',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------- pos_rates (config de taxas POS — 1 por org) ----------
create table if not exists public.pos_rates (
  org_id uuid primary key default public.auth_org_id(),
  config jsonb not null default '{}'::jsonb,          -- PosConfig (custo/spread/selic/…)
  updated_at timestamptz not null default now()
);

-- ---------- company_profiles (perfil do onboarding — 1 por org) ----------
create table if not exists public.company_profiles (
  org_id uuid primary key default public.auth_org_id(),
  profile jsonb not null default '{}'::jsonb,          -- a4p_company (identidade/perfil/governança)
  updated_at timestamptz not null default now()
);

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array['approvals','reimbursements','nfse','pos_rates','company_profiles']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_org on public.%I', t, t);
    execute format(
      'create policy %I_org on public.%I using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id())',
      t, t);
    execute format('create index if not exists %I_org_idx on public.%I (org_id)', t, t);
  end loop;
end $$;
