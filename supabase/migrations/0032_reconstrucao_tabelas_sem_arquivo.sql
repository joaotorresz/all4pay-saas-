-- ═══════════════════════════════════════════════════════════════════════════
-- RECONSTRUÇÃO — as tabelas que existiam só no banco
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ **ESTE ARQUIVO NÃO SE APLICA AO BANCO ATUAL.** Os objetos aqui JÁ EXISTEM
-- em produção — foram criados direto pelo painel, sem passar por migration
-- nenhuma. O arquivo existe para o caso que hoje não se sustenta: **montar o
-- ambiente do zero**. Sem ele, um banco novo nasce sem aprovações, sem
-- reembolsos, sem NFS-e e sem Open Finance, e o código quebra em runtime
-- procurando tabela que ninguém criou.
--
-- Gerado a partir do catálogo do banco de produção em 04/08/2026 (`pg_catalog`
-- + `pg_get_indexdef` + `pg_get_expr`), não escrito de memória.
--
-- As seis tabelas correspondem a estas migrations aplicadas sem arquivo:
--   create_approvals_table · create_reembolsos_table · create_nfse_table
--   create_pluggy_items_table · create_bank_accounts_table
--   create_bank_transactions_table
--
-- ⚠️ Faltam ainda, e estão declaradas com prazo em `supabase/esquema.json`:
-- os `alter table` avulsos (boleto em movements, itens em recurrences), os
-- endurecimentos de RLS aplicados como patch, o esquema da maquininha (`maq_*`,
-- que é outro produto no mesmo projeto) e — as duas que importam — as
-- migrations `0018_ai_learning` e `0020_org_movements`, cujos objetos NÃO
-- existem no banco.

/* ── aprovações ──────────────────────────────────────────────────────────── */
create table if not exists public.approvals (
  id uuid default gen_random_uuid() not null,
  org_id uuid default auth_org_id() not null,
  movement_id uuid,
  requester_id uuid,
  approver_id uuid,
  amount numeric default 0 not null,
  category_id uuid,
  cost_center_id uuid,
  reason text,
  justification text,
  status approval_status default 'pending'::approval_status not null,
  level integer default 1 not null,
  levels_required integer default 1 not null,
  decided_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  constraint approvals_pkey primary key (id),
  constraint approvals_movement_id_fkey foreign key (movement_id) references movements(id) on delete set null,
  constraint approvals_org_id_fkey foreign key (org_id) references organizations(id) on delete cascade,
  -- A segregação de funções da ONDA 9, no nível estrutural.
  constraint approvals_segregacao check (approver_id is null or requester_id is null or approver_id <> requester_id)
);
create index if not exists approvals_movement_idx on public.approvals (movement_id);
create index if not exists approvals_org_idx on public.approvals (org_id);
alter table public.approvals enable row level security;

/* ── reembolsos ──────────────────────────────────────────────────────────── */
create table if not exists public.reembolsos (
  id uuid default gen_random_uuid() not null,
  org_id uuid default auth_org_id() not null,
  colaborador_id uuid,
  approval_id uuid,
  movement_id uuid,
  itens jsonb default '[]'::jsonb not null,
  amount numeric default 0 not null,
  pix_key text,
  status reembolso_status default 'rascunho'::reembolso_status not null,
  created_at timestamp with time zone default now() not null,
  constraint reembolsos_pkey primary key (id),
  constraint reembolsos_approval_id_fkey foreign key (approval_id) references approvals(id) on delete set null,
  constraint reembolsos_colaborador_id_fkey foreign key (colaborador_id) references parties(id) on delete set null,
  constraint reembolsos_movement_id_fkey foreign key (movement_id) references movements(id) on delete set null,
  constraint reembolsos_org_id_fkey foreign key (org_id) references organizations(id) on delete cascade
);
create index if not exists reembolsos_colaborador_idx on public.reembolsos (colaborador_id);
create index if not exists reembolsos_org_idx on public.reembolsos (org_id);
alter table public.reembolsos enable row level security;

/* ── NFS-e ───────────────────────────────────────────────────────────────── */
create table if not exists public.nfse (
  id uuid default gen_random_uuid() not null,
  org_id uuid default auth_org_id() not null,
  tomador_id uuid,
  movement_id uuid,
  recurrence_id uuid,
  service_code text,
  description text,
  amount numeric default 0 not null,
  iss_rate numeric,
  iss_retained boolean default false not null,
  taxes jsonb default '{}'::jsonb not null,
  municipality text,
  competence date,
  await_payment boolean default false not null,
  numero text,
  codigo_verificacao text,
  status nfse_status default 'rascunho'::nfse_status not null,
  created_at timestamp with time zone default now() not null,
  constraint nfse_pkey primary key (id),
  constraint nfse_movement_id_fkey foreign key (movement_id) references movements(id) on delete set null,
  constraint nfse_org_id_fkey foreign key (org_id) references organizations(id) on delete cascade,
  constraint nfse_recurrence_id_fkey foreign key (recurrence_id) references recurrences(id) on delete set null,
  constraint nfse_tomador_id_fkey foreign key (tomador_id) references parties(id) on delete set null
);
create index if not exists nfse_movement_idx on public.nfse (movement_id);
create index if not exists nfse_org_idx on public.nfse (org_id);
create index if not exists nfse_recurrence_idx on public.nfse (recurrence_id);
alter table public.nfse enable row level security;

/* ── Open Finance (Pluggy) ───────────────────────────────────────────────── */
create table if not exists public.pluggy_items (
  id uuid default gen_random_uuid() not null,
  org_id uuid default auth_org_id() not null,
  pluggy_item_id text not null,
  connector_id integer,
  connector_name text,
  client_user_id text,
  status text,
  status_detail jsonb,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint pluggy_items_pkey primary key (id),
  constraint pluggy_items_org_id_fkey foreign key (org_id) references organizations(id) on delete cascade
);
-- ⚠️ O único por org+item: é ele que impede o mesmo vínculo bancário de entrar
-- duas vezes quando o webhook repete.
create unique index if not exists pluggy_items_item_uniq on public.pluggy_items (org_id, pluggy_item_id);
create index if not exists pluggy_items_org_connector_idx on public.pluggy_items (org_id, connector_id);
alter table public.pluggy_items enable row level security;

create table if not exists public.bank_accounts (
  id uuid default gen_random_uuid() not null,
  org_id uuid default auth_org_id() not null,
  item_id uuid,
  pluggy_account_id text not null,
  type text,
  subtype text,
  name text,
  number text,
  balance numeric,
  currency text default 'BRL'::text,
  raw jsonb,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  linked_financial_account_id uuid,
  balance_source text default 'open_finance'::text not null,
  constraint bank_accounts_pkey primary key (id),
  constraint bank_accounts_item_id_fkey foreign key (item_id) references pluggy_items(id) on delete cascade,
  constraint bank_accounts_linked_financial_account_id_fkey foreign key (linked_financial_account_id) references financial_accounts(id) on delete set null,
  constraint bank_accounts_org_id_fkey foreign key (org_id) references organizations(id) on delete cascade
);
create unique index if not exists bank_accounts_acct_uniq on public.bank_accounts (org_id, pluggy_account_id);
create index if not exists bank_accounts_linked_fin_idx on public.bank_accounts (linked_financial_account_id);
create index if not exists bank_accounts_org_idx on public.bank_accounts (org_id);
alter table public.bank_accounts enable row level security;

create table if not exists public.bank_transactions (
  id uuid default gen_random_uuid() not null,
  org_id uuid default auth_org_id() not null,
  account_id uuid,
  pluggy_transaction_id text not null,
  amount numeric,
  currency text default 'BRL'::text,
  date timestamp with time zone,
  description text,
  category text,
  type text,
  movement_id uuid,
  raw jsonb,
  created_at timestamp with time zone default now() not null,
  constraint bank_transactions_pkey primary key (id),
  constraint bank_transactions_account_id_fkey foreign key (account_id) references bank_accounts(id) on delete cascade,
  constraint bank_transactions_movement_id_fkey foreign key (movement_id) references movements(id) on delete set null,
  constraint bank_transactions_org_id_fkey foreign key (org_id) references organizations(id) on delete cascade
);
-- A idempotência da ingestão bancária: a mesma transação do Open Finance não
-- entra duas vezes, por mais que o webhook reenvie.
create unique index if not exists bank_transactions_txn_uniq on public.bank_transactions (org_id, pluggy_transaction_id);
create index if not exists bank_transactions_acc_idx on public.bank_transactions (account_id);
create index if not exists bank_transactions_org_idx on public.bank_transactions (org_id);
alter table public.bank_transactions enable row level security;

/* ── políticas: isolamento por organização ───────────────────────────────── */
do $$
declare t text;
begin
  foreach t in array array['approvals','reembolsos','nfse','pluggy_items','bank_accounts','bank_transactions'] loop
    if not exists (select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
                    where c.relname = t and p.polname = 'org rw ' || t) then
      execute format(
        'create policy %L on public.%I for all to authenticated using (org_id = auth_org_id()) with check (org_id = auth_org_id())',
        'org rw ' || t, t);
    end if;
  end loop;
end $$;
