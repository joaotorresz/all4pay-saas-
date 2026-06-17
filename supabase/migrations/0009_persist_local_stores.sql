-- 0009_persist_local_stores.sql
-- Versiona as tabelas que o app já sabe ler/gravar em LIVE (as libs aprovacoes/
-- reembolsos/nfse já têm caminho Supabase) mas cujo schema só existia no remoto.
-- Colunas batem EXATAMENTE com o que o código usa. Também liga a Governança aos
-- membros reais (organization_members) e versiona pos_rates/company_profiles
-- (ainda só locais — schema pronto p/ wiring). Idempotente + org_id RLS.

-- ---------- Governança real: perfil/permissões por membro ----------
alter table public.organization_members add column if not exists display_name text;
alter table public.organization_members add column if not exists email text;
alter table public.organization_members add column if not exists permissions jsonb not null default '{}'::jsonb;
alter table public.organization_members add column if not exists approval_limit numeric;
alter table public.organization_members add column if not exists can_cancel boolean not null default false;

-- ---------- approvals (gate de alçada) — colunas de aprovacoes.ts ----------
create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org_id(),
  movement_id uuid references public.movements (id) on delete set null,
  amount numeric not null default 0,
  reason text,
  justification text,
  status text not null default 'pending',     -- pending|approved|rejected|returned
  level integer not null default 1,
  levels_required integer not null default 1,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- ---------- reembolsos — colunas de reembolsos.ts ----------
create table if not exists public.reembolsos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org_id(),
  colaborador_id uuid references public.parties (id) on delete set null,
  approval_id uuid references public.approvals (id) on delete set null,
  movement_id uuid references public.movements (id) on delete set null,
  itens jsonb not null default '[]'::jsonb,
  amount numeric not null default 0,
  pix_key text,
  status text not null default 'pendente',
  created_at timestamptz not null default now()
);

-- ---------- nfse — colunas de nfse.ts ----------
create table if not exists public.nfse (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org_id(),
  tomador_id uuid references public.parties (id) on delete set null,
  movement_id uuid references public.movements (id) on delete set null,
  recurrence_id uuid references public.recurrences (id) on delete set null,
  service_code text,
  description text,
  amount numeric not null default 0,
  iss_rate numeric,
  municipality text,
  competence text,
  await_payment boolean not null default false,
  numero text,
  codigo_verificacao text,
  status text not null default 'autorizada',
  created_at timestamptz not null default now()
);

-- ---------- pos_rates (config de taxas POS — 1 por org; wiring futuro) ----------
create table if not exists public.pos_rates (
  org_id uuid primary key default public.auth_org_id(),
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- company_profiles (perfil do onboarding — 1 por org; wiring futuro) ----------
create table if not exists public.company_profiles (
  org_id uuid primary key default public.auth_org_id(),
  profile jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- RLS (isolamento por organização) ----------
do $$
declare t text;
begin
  foreach t in array array['approvals','reembolsos','nfse','pos_rates','company_profiles']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_org on public.%I', t, t);
    execute format(
      'create policy %I_org on public.%I using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id())',
      t, t);
    execute format('create index if not exists %I_org_idx on public.%I (org_id)', t, t);
  end loop;
end $$;
