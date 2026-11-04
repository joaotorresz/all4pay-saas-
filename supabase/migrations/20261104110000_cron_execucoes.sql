-- ═══════════════════════════════════════════════════════════════════════════
-- O RASTRO DE CADA EXECUÇÃO DE CRON — `cron_execucoes` (04/11/2026, Fase 3.4)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O materializador de recorrências nunca completou uma execução em produção e
-- ninguém viu: sem trabalho a fazer (ou sem a chave de serviço) ele não
-- escrevia nada, e "não rodou" ficava igual a "rodou e não havia o que fazer".
-- Agora cada execução completa grava uma linha aqui, mesmo sem trabalho, e a
-- guarda agendada `crons-no-ar` reprova o cron diário parado há mais de 26 h.
--
-- ⚠️ Tabela da PLATAFORMA, sem empresa: quem grava é a chave de serviço (as
-- rotas de cron) e quem lê é o papel só-leitura do CI (`ci_leitor`). Nenhum
-- usuário do app lê ou grava (RLS ligada, sem política, sem grant).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.cron_execucoes (
  id bigint generated always as identity primary key,
  job text not null check (job in ('recorrencias', 'automacoes')),
  iniciado_em timestamptz not null,
  terminado_em timestamptz not null default now(),
  ok boolean not null,
  resumo jsonb not null default '{}'::jsonb,
  constraint cron_execucoes_ordem check (terminado_em >= iniciado_em)
);

comment on table public.cron_execucoes is
  'Uma linha por execução completa de cada cron da Vercel (mesmo sem trabalho). Consumida pela guarda agendada crons-no-ar.';

create index if not exists cron_execucoes_job_idx on public.cron_execucoes (job, terminado_em desc);

alter table public.cron_execucoes enable row level security;
revoke all on table public.cron_execucoes from public, anon, authenticated;
grant select, insert on table public.cron_execucoes to service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'ci_leitor') then
    grant select on table public.cron_execucoes to ci_leitor;
  else
    raise warning 'cron_execucoes: papel ci_leitor ausente; a guarda crons-no-ar não vai conseguir ler a tabela até o papel existir';
  end if;
end
$$;
