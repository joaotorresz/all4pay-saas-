-- 0010_ledger_core.sql
-- Fase 0 do blueprint (docs/SISTEMA_all4pay_financeiro.md): o RAZÃO de dupla
-- entrada como fonte única da verdade — a fundação que não dá para refatorar
-- depois. Adaptado ao padrão do projeto: org_id default auth_org_id() + RLS por
-- organização (0005-0007) + NUMERIC(20,4) (dinheiro nunca é float). Idempotente.
--
-- Invariantes NO BANCO (não na UI): (1) lançamento postado tem D=C; (2) período
-- fechado/travado rejeita postagem. Imutabilidade: correção por estorno.

-- ---------- Entidades legais (multiempresa + consolidação) ----------
create table if not exists public.entities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org_id(),
  name text not null,
  functional_currency char(3) not null default 'BRL',
  parent_entity_id uuid references public.entities (id),
  created_at timestamptz not null default now()
);

-- ---------- Plano de contas (hierárquico) ----------
create table if not exists public.ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org_id(),
  entity_id uuid references public.entities (id),
  code text not null,
  name text not null,
  type text not null check (type in ('asset','liability','equity','revenue','expense')),
  parent_account_id uuid references public.ledger_accounts (id),
  is_postable boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, entity_id, code)
);

-- ---------- Períodos contábeis (o cadeado do fechamento) ----------
create table if not exists public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org_id(),
  entity_id uuid references public.entities (id),
  period date not null, -- 1º dia do mês
  status text not null default 'open' check (status in ('open','closed','locked')),
  closed_at timestamptz,
  closed_by uuid,
  unique (org_id, entity_id, period)
);

-- ---------- Lançamento (cabeçalho) ----------
create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org_id(),
  entity_id uuid references public.entities (id),
  period_id uuid references public.accounting_periods (id),
  entry_date date not null,
  description text,
  source text not null default 'manual', -- manual|bank|ar|ap|revrec|depreciation|system
  status text not null default 'draft' check (status in ('draft','posted','void')),
  is_reversal_of uuid references public.journal_entries (id),
  external_key text, -- idempotência (ex.: id Pluggy)
  created_by uuid,
  posted_by uuid,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, external_key)
);

-- ---------- Linhas do lançamento (a dupla entrada vive aqui) ----------
create table if not exists public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org_id(),
  journal_entry_id uuid not null references public.journal_entries (id) on delete cascade,
  account_id uuid not null references public.ledger_accounts (id),
  debit numeric(20,4) not null default 0,
  credit numeric(20,4) not null default 0,
  currency char(3) not null default 'BRL',
  fx_rate numeric(20,8) not null default 1,
  dimensions jsonb not null default '{}'::jsonb, -- {cliente, depto, projeto, centro...}
  memo text,
  check (debit >= 0 and credit >= 0),
  check (not (debit > 0 and credit > 0)) -- linha é débito OU crédito
);

-- ---------- Dimensões (tags) configuráveis ----------
create table if not exists public.dimensions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org_id(),
  key text not null,
  label text not null,
  unique (org_id, key)
);

-- ---------- Orçamento (Fase 3) ----------
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org_id(),
  entity_id uuid references public.entities (id),
  account_id uuid references public.ledger_accounts (id),
  period date not null,
  dimensions jsonb not null default '{}'::jsonb,
  amount numeric(20,4) not null default 0
);

-- ---------- Camada 3 — Cronogramas (amortização / depreciação) ----------
create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org_id(),
  entity_id uuid references public.entities (id),
  kind text not null check (kind in ('prepaid','fixed_asset')),
  description text,
  total numeric(20,4) not null,
  residual numeric(20,4) not null default 0,
  start_period date not null,
  periods int not null,
  method text not null default 'straight_line',
  account_id uuid references public.ledger_accounts (id),
  contra_account_id uuid references public.ledger_accounts (id),
  created_at timestamptz not null default now()
);

-- ---------- Reconhecimento de receita (CPC 47 / IFRS 15) ----------
create table if not exists public.revenue_contracts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org_id(),
  entity_id uuid references public.entities (id),
  customer text,
  total numeric(20,4) not null,
  model text not null check (model in ('subscription','usage','milestone')),
  start_date date,
  end_date date,
  source_pdf_url text,
  created_at timestamptz not null default now()
);
create table if not exists public.revenue_schedule (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org_id(),
  contract_id uuid not null references public.revenue_contracts (id) on delete cascade,
  period date not null,
  amount numeric(20,4) not null,
  recognized boolean not null default false,
  journal_entry_id uuid references public.journal_entries (id)
);

-- ---------- Checklist de fechamento ----------
create table if not exists public.close_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org_id(),
  period_id uuid references public.accounting_periods (id),
  title text not null,
  kind text not null check (kind in ('standard','custom','ai')),
  status text not null default 'pending' check (status in ('pending','running','review','done')),
  assignee uuid,
  result_journal_entry_id uuid references public.journal_entries (id)
);

-- ---------- Ingestão — eventos brutos (reprocessamento determinístico) ----------
create table if not exists public.raw_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org_id(),
  provider text not null, -- pluggy | upload | manual
  external_id text not null, -- idempotência
  payload jsonb not null,
  processed_at timestamptz,
  journal_entry_id uuid references public.journal_entries (id),
  created_at timestamptz not null default now(),
  unique (org_id, provider, external_id)
);

-- ---------- IA — trilha de auditoria do assistente ----------
create table if not exists public.ai_actions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org_id(),
  user_id uuid,
  kind text not null, -- read | draft_entry | generate_artifact
  prompt text,
  tool_called text,
  result jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- INVARIANTE 1: lançamento postado tem débitos = créditos
-- ============================================================
create or replace function public.check_entry_balanced()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare diff numeric;
begin
  if new.status = 'posted' then
    select coalesce(sum(debit) - sum(credit), 0) into diff
      from public.journal_lines where journal_entry_id = new.id;
    if diff <> 0 then
      raise exception 'Lançamento % desbalanceado (diferença %)', new.id, diff;
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_entry_balanced on public.journal_entries;
create trigger trg_entry_balanced
  before update of status on public.journal_entries
  for each row execute function public.check_entry_balanced();

-- ============================================================
-- INVARIANTE 2: período fechado/travado rejeita postagem
-- ============================================================
create or replace function public.check_period_open()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare st text;
begin
  if new.period_id is not null then
    select status into st from public.accounting_periods where id = new.period_id;
    if st in ('closed','locked') and new.status = 'posted' then
      raise exception 'Período fechado/travado: não é possível postar';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_period_open on public.journal_entries;
create trigger trg_period_open
  before insert or update on public.journal_entries
  for each row execute function public.check_period_open();

-- ============================================================
-- Índices
-- ============================================================
create index if not exists journal_lines_entry_idx on public.journal_lines (journal_entry_id);
create index if not exists journal_lines_account_idx on public.journal_lines (account_id);
create index if not exists journal_entries_entity_period_idx on public.journal_entries (entity_id, period_id);
create index if not exists ledger_accounts_entity_idx on public.ledger_accounts (entity_id);
create index if not exists revenue_schedule_contract_idx on public.revenue_schedule (contract_id);

-- ============================================================
-- RLS por organização (isolamento multi-tenant) — em todas as tabelas
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'entities','ledger_accounts','accounting_periods','journal_entries','journal_lines',
    'dimensions','budgets','schedules','revenue_contracts','revenue_schedule','close_tasks',
    'raw_events','ai_actions'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_org on public.%I', t, t);
    execute format(
      'create policy %I_org on public.%I using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id())',
      t, t);
    execute format('create index if not exists %I_org_idx on public.%I (org_id)', t, t);
  end loop;
end $$;
