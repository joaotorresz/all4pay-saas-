-- ============================================================
-- 0011 — Tags por movimento (atribuição de dimensão "Tag")
-- ------------------------------------------------------------
-- A `dimensions` (0010) guarda as DEFINIÇÕES de dimensão (key/label); falta a
-- ATRIBUIÇÃO de tags por movimento (a dimensão "Tag" do relatório /dimensoes,
-- com drill-down até a transação). Esta tabela fecha esse gap. Isolada por org
-- (RLS), no mesmo padrão das tabelas do 0010.
-- ============================================================
create table if not exists public.movement_tags (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org_id(),
  movement_id uuid not null references public.movements (id) on delete cascade,
  tag text not null,
  created_at timestamptz not null default now(),
  unique (org_id, movement_id, tag)
);

alter table public.movement_tags enable row level security;
drop policy if exists movement_tags_org on public.movement_tags;
create policy movement_tags_org on public.movement_tags
  using (org_id = public.auth_org_id())
  with check (org_id = public.auth_org_id());
create index if not exists movement_tags_org_idx on public.movement_tags (org_id);
create index if not exists movement_tags_movement_idx on public.movement_tags (movement_id);
