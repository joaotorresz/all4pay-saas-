-- 0019 — Projetos como entidade de primeira classe + vínculo no lançamento.
--
-- O projeto já era cadastrado (centro de resultado TEMPORAL: uma campanha, um
-- lançamento), mas vivia só no cliente e nenhum movimento o referenciava — o
-- filtro "Projeto" dos relatórios não tinha o que filtrar. Esta migration dá
-- casa ao cadastro e cria o vínculo.
--
-- ⚠️ GERADA COMO ARQUIVO — aplicar ao remoto. Enquanto não for aplicada, o app
-- resolve o projeto pelo vínculo local (`lib/projeto-vinculo`) e o
-- `getRiscoInput` cai no select sem o embed; nada quebra.

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null default public.auth_org_id(),
  name        text not null,
  code        text,
  description text,
  start_date  date,
  end_date    date,
  -- Previsões do cadastro: permitem medir realizado × previsto.
  planned_revenue numeric(14, 2) not null default 0,
  planned_expense numeric(14, 2) not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists projects_org_idx on public.projects (org_id);
-- Nome único por organização: dois "Turma 12" no mesmo tenant tornariam o
-- relatório por projeto ambíguo.
create unique index if not exists projects_org_name_unique
  on public.projects (org_id, lower(name));

alter table public.projects enable row level security;

drop policy if exists projects_rw on public.projects;
create policy projects_rw on public.projects
  for all
  using (org_id = public.auth_org_id())
  with check (org_id = public.auth_org_id());

-- O vínculo. `on delete set null`: apagar um projeto não pode apagar o
-- lançamento nem o histórico financeiro — o movimento apenas deixa de ter
-- projeto.
alter table public.movements
  add column if not exists project_id uuid references public.projects (id) on delete set null;

create index if not exists movements_project_idx
  on public.movements (project_id) where project_id is not null;

-- O rateio já existente também passa a aceitar projeto, para um lançamento
-- dividido entre duas campanhas.
alter table public.movement_splits
  add column if not exists project_id uuid references public.projects (id) on delete set null;
