-- ============================================================
--  all4pay — Financial OS: regras, execuções e auditoria.
--  PROPOSAL — review before applying. Not yet run on remote.
--  Quando aplicado + NEXT_PUBLIC_ALL4PAY_DEMO=false, o motor de
--  regras passa a persistir/auditar de verdade.
-- ============================================================

-- Regras (low-code): conditions/actions como JSONB.
create table public.financial_rules (
  id          text primary key,
  nome        text not null,
  trigger     text not null,
  conditions  jsonb not null default '[]'::jsonb,
  actions     jsonb not null default '[]'::jsonb,
  prioridade  text not null default 'media',
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);
create index financial_rules_trigger_idx on public.financial_rules (trigger) where ativo;

-- Execuções de ações disparadas pelas regras.
create table public.rule_executions (
  id          uuid primary key default gen_random_uuid(),
  rule_id     text references public.financial_rules (id) on delete set null,
  rule_nome   text,
  acao        text not null,
  destino     text,
  status      text not null,        -- executada | enfileirada | falha
  detalhe     text,
  created_at  timestamptz not null default now()
);
create index rule_executions_rule_idx on public.rule_executions (rule_id);

-- Audit Trail (compliance / financeiro corporativo).
create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  usuario     text not null,
  acao        text not null,
  antes       jsonb,
  depois      jsonb,
  created_at  timestamptz not null default now()
);

-- ---- RLS ----
alter table public.financial_rules enable row level security;
alter table public.rule_executions enable row level security;
alter table public.audit_log       enable row level security;

create policy "auth rw rules"      on public.financial_rules for all to authenticated using (true) with check (true);
create policy "auth rw executions" on public.rule_executions for all to authenticated using (true) with check (true);
create policy "auth read audit"    on public.audit_log       for select to authenticated using (true);
create policy "auth write audit"   on public.audit_log       for insert to authenticated with check (true);
