-- ═══════════════════════════════════════════════════════════════════════════
-- OS AGENTES DA QUATTRO AI · ETAPA 1 — A MOLDURA (04/11/2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Plano "AI first" aprovado pelo dono em 03/11/2026: um agente por tarefa
-- (cobrança, conciliação, contas a pagar, caixa, fechamento). O agente PROPÕE;
-- a pessoa aprova, ou o limite que a empresa escolheu deixa ele fazer sozinho.
--
-- Duas tabelas:
--
--   1. `agentes` — o que cada empresa ligou, em que NÍVEL e com que LIMITE.
--      Uma linha por (empresa, agente). Tudo nasce DESLIGADO, no nível 1, por
--      SEED (as empresas de hoje) E por GATILHO (as de amanhã), os dois lendo
--      `agentes_padrao()`.
--   2. `agente_propostas` — a fila "Para você aprovar" e o histórico do que
--      cada agente fez. Índice ÚNICO (org_id, agente, chave): o agente que roda
--      duas vezes não propõe duas vezes.
--
-- ⚠️ O BANCO É QUEM RECUSA:
--   · Contas a pagar, caixa e fechamento não passam do nível 1 (restrição):
--     dinheiro saindo sozinho é o maior risco do plano.
--   · A proposta só muda de estado pelo caminho declarado, e estado terminal
--     (recusada, executada, falhou, expirada) não ressuscita (gatilho).
--   · Só o servidor (chave de serviço) CRIA proposta e marca a execução. A
--     pessoa só DECIDE, pela função `agente_decidir`, que exige a permissão
--     `aprovar` (ou `administrar`) NA EMPRESA DA PROPOSTA.
--
-- ⚠️ NENHUMA linha desta migration executa nada: nenhum agente produz proposta
-- ainda (a etapa 2 traz o de cobrança), e todos nascem desligados, atrás do
-- interruptor `AGENTES=ligado` da plataforma.
--
-- ⚠️ MUDA QUEM PODE CHAMAR O QUÊ — declarado:
--   · `authenticated` lê `agentes` e `agente_propostas` da empresa ABERTA;
--     escreve em `agentes` só quem administra; não escreve em
--     `agente_propostas` (só decide, pela função).
--   · `service_role` lê `agentes` e cria/atualiza `agente_propostas` (o
--     produtor de cada agente, nas próximas etapas).
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. A CONFIGURAÇÃO DE CADA AGENTE
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.agentes (
  -- `id` existe para a trilha genérica (`auditar_escrita` lê `->> 'id'`):
  -- "quem deixou o agente fazer sozinho, e quando" é pergunta de auditoria.
  id uuid not null default gen_random_uuid() primary key,
  org_id uuid not null default public.auth_org_id()
    references public.organizations(id) on delete cascade,
  agente text not null
    check (agente in ('cobranca','conciliacao','contas_pagar','caixa','fechamento')),
  ativo boolean not null default false,
  nivel smallint not null default 1 check (nivel between 0 and 3),
  -- Limite por ação, em R$ (nível 2). 0 = nenhuma ação com valor sai sozinha.
  limite_valor numeric(14,2) not null default 0 check (limite_valor >= 0),
  -- Quantas ações por dia ele faz sozinho (nível 2). 0 = nenhuma.
  limite_dia integer not null default 0 check (limite_dia between 0 and 1000),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid(),
  unique (org_id, agente),
  -- ⚠️ O teto do plano: pagar, avisar do caixa e fechar o mês nunca saem
  -- sozinhos. Mudar isto é decisão do dono, com migration própria.
  constraint agentes_nivel_maximo check (
    agente not in ('contas_pagar','caixa','fechamento') or nivel <= 1)
);
alter table public.agentes enable row level security;

comment on table public.agentes is
  'O que cada empresa ligou de agente da Quattro AI, em que nível (0 avisa, 1 pede aprovação, 2 faz até o limite, 3 faz e avisa). Nasce DESLIGADO, por seed e por gatilho.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. AS PROPOSTAS (a fila "Para você aprovar" e o histórico)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.agente_propostas (
  id uuid not null default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  agente text not null
    check (agente in ('cobranca','conciliacao','contas_pagar','caixa','fechamento')),
  -- A chave de DEDUPLICAÇÃO, montada pelo agente (ex.: titulo:<id>:<etapa>).
  chave text not null check (length(chave) between 1 and 300),
  -- O que ele quer fazer e por quê, em português da tela.
  titulo text not null check (length(titulo) between 1 and 200),
  porque text not null check (length(porque) between 1 and 1000),
  -- Nulo = a ação não envolve dinheiro (uma mensagem).
  valor numeric(14,2) check (valor is null or valor >= 0),
  -- O que o executor precisa para fazer (lido só pelo servidor do agente).
  dados jsonb not null default '{}'::jsonb check (jsonb_typeof(dados) = 'object'),
  estado text not null default 'pendente'
    check (estado in ('pendente','aprovada','recusada','executada','falhou','expirada')),
  -- Quem levou ao estado: a pessoa que decidiu, ou nulo quando foi o limite.
  decidida_por uuid references auth.users(id) on delete set null,
  decidida_em timestamptz,
  motivo text check (motivo is null or length(motivo) <= 500),
  executada_em timestamptz,
  erro text check (erro is null or length(erro) <= 1000),
  criada_em timestamptz not null default now()
);
alter table public.agente_propostas enable row level security;

-- ⚠️ A TRAVA: o agente que roda duas vezes (cron, à mão, dois ao mesmo tempo)
-- bate aqui antes de propor de novo.
create unique index if not exists agente_propostas_unica
  on public.agente_propostas (org_id, agente, chave);
create index if not exists agente_propostas_fila
  on public.agente_propostas (org_id, estado, criada_em desc);

comment on table public.agente_propostas is
  'O que cada agente propôs e o que aconteceu. Só o servidor cria; a pessoa decide por agente_decidir. Estado terminal não muda.';

-- ───────────────────────────────────────────────────────────────────────────
-- 3. A MÁQUINA DE ESTADOS DA PROPOSTA
-- ───────────────────────────────────────────────────────────────────────────
--   pendente ─┬─> aprovada ─┬─> executada
--             │             └─> falhou
--             ├─> executada   (dentro do limite: o agente faz sozinho)
--             ├─> falhou      (dentro do limite, e não deu certo)
--             ├─> recusada
--             └─> expirada
-- Estado terminal não muda. A chave, a empresa, o agente e o que foi proposto
-- também não: aprovar uma coisa e executar outra é o defeito que isto impede.
create or replace function public.agente_propostas_transicao()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if new.org_id is distinct from old.org_id or new.agente is distinct from old.agente
     or new.chave is distinct from old.chave or new.titulo is distinct from old.titulo
     or new.porque is distinct from old.porque or new.valor is distinct from old.valor
     or new.dados is distinct from old.dados or new.criada_em is distinct from old.criada_em then
    raise exception 'agente_propostas: o que foi proposto não muda depois de criado.';
  end if;
  if new.estado = old.estado then
    return new;
  end if;
  if old.estado in ('recusada','executada','falhou','expirada') then
    raise exception 'agente_propostas: a proposta já terminou (%) e não muda.', old.estado;
  end if;
  if not (
       (old.estado = 'pendente' and new.estado in ('aprovada','recusada','expirada','executada','falhou'))
    or (old.estado = 'aprovada' and new.estado in ('executada','falhou'))
  ) then
    raise exception 'agente_propostas: % → % não é uma transição permitida.', old.estado, new.estado;
  end if;
  return new;
end $fn$;

drop trigger if exists agente_propostas_transicao on public.agente_propostas;
create trigger agente_propostas_transicao
  before update on public.agente_propostas
  for each row execute function public.agente_propostas_transicao();

-- Nasce pendente, sempre: o agente não cria proposta já decidida.
create or replace function public.agente_propostas_nasce_pendente()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if new.estado <> 'pendente' or new.decidida_por is not null or new.decidida_em is not null
     or new.executada_em is not null then
    raise exception 'agente_propostas: a proposta nasce pendente.';
  end if;
  return new;
end $fn$;

drop trigger if exists agente_propostas_nasce_pendente on public.agente_propostas;
create trigger agente_propostas_nasce_pendente
  before insert on public.agente_propostas
  for each row execute function public.agente_propostas_nasce_pendente();

-- ───────────────────────────────────────────────────────────────────────────
-- 4. A TRILHA — as duas tabelas são de negócio (guarda `trilha-completa`)
-- ───────────────────────────────────────────────────────────────────────────
drop trigger if exists zz_auditar_agentes on public.agentes;
create trigger zz_auditar_agentes
  after insert or update or delete on public.agentes
  for each row execute function public.auditar_escrita();

drop trigger if exists zz_auditar_agente_propostas on public.agente_propostas;
create trigger zz_auditar_agente_propostas
  after insert or update or delete on public.agente_propostas
  for each row execute function public.auditar_escrita();

-- ───────────────────────────────────────────────────────────────────────────
-- 5. QUEM LÊ E QUEM ESCREVE
-- ───────────────────────────────────────────────────────────────────────────
revoke all on public.agentes from public, anon, authenticated, service_role;
revoke all on public.agente_propostas from public, anon, authenticated, service_role;
-- ⚠️ Sem DELETE: desligar é `ativo = false`, e apagar uma proposta é apagar a
-- prova do que o agente fez em nome da empresa.
grant select, insert, update on public.agentes to authenticated;
grant select on public.agente_propostas to authenticated;
grant select on public.agentes to service_role;
grant select, insert, update on public.agente_propostas to service_role;

drop policy if exists agentes_org on public.agentes;
create policy agentes_org on public.agentes
  for all to authenticated
  using (org_id = public.auth_org_id())
  with check (org_id = public.auth_org_id());

-- ⚠️ Deixar um agente agir em nome da empresa é ato de quem administra (a mesma
-- regra das automações). A restritiva TIRA a escrita de quem não administra.
drop policy if exists agentes_escrita_admin on public.agentes;
create policy agentes_escrita_admin on public.agentes
  as restrictive for all to authenticated
  using (true)
  with check (public.tem_permissao('administrar'));

drop policy if exists agente_propostas_org on public.agente_propostas;
create policy agente_propostas_org on public.agente_propostas
  for select to authenticated
  using (org_id = public.auth_org_id());

-- ───────────────────────────────────────────────────────────────────────────
-- 6. DECIDIR — a única porta da pessoa
-- ───────────────────────────────────────────────────────────────────────────
-- ⚠️ A permissão é "o que eu sou NA EMPRESA DA PROPOSTA", nunca a do primeiro
-- vínculo: quem aprova em uma empresa não decide a fila de outra.
create or replace function public.agente_decidir(p_id uuid, p_aprovar boolean, p_motivo text default null)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v record;
begin
  if auth.uid() is null then
    raise exception 'agente_decidir: é preciso estar conectado.';
  end if;
  select * into v from public.agente_propostas where id = p_id for update;
  if not found or v.org_id is distinct from public.auth_org_id() then
    raise exception 'agente_decidir: proposta não encontrada nesta empresa.';
  end if;
  if not (public.tem_permissao('aprovar', v.org_id) or public.tem_permissao('administrar', v.org_id)) then
    raise exception 'Seu papel nesta empresa não decide o que os agentes propõem.';
  end if;
  if v.estado <> 'pendente' then
    raise exception 'agente_decidir: a proposta já foi decidida (%).', v.estado;
  end if;
  update public.agente_propostas
     set estado = case when p_aprovar then 'aprovada' else 'recusada' end,
         decidida_por = auth.uid(),
         decidida_em = now(),
         motivo = nullif(trim(coalesce(p_motivo, '')), '')
   where id = p_id;
  return case when p_aprovar then 'aprovada' else 'recusada' end;
end $fn$;

revoke all on function public.agente_decidir(uuid, boolean, text) from public, anon;
grant execute on function public.agente_decidir(uuid, boolean, text) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 7. O PADRÃO — uma função só, lida pelo seed E pelo gatilho
-- ───────────────────────────────────────────────────────────────────────────
-- ⚠️ Espelho de `configPadrao` em `src/core/agentes` (a guarda `agentes`
-- confere os dois).
create or replace function public.agentes_padrao()
returns table (agente text, nivel smallint)
language sql immutable set search_path = public as $$
  values
    ('cobranca'::text,   1::smallint),
    ('conciliacao',      1::smallint),
    ('contas_pagar',     1::smallint),
    ('caixa',            1::smallint),
    ('fechamento',       1::smallint);
$$;

-- As empresas de hoje (todas DESLIGADAS).
insert into public.agentes (org_id, agente, ativo, nivel)
select o.id, p.agente, false, p.nivel
  from public.organizations o
  cross join public.agentes_padrao() p
on conflict (org_id, agente) do nothing;

-- As de amanhã.
create or replace function public.agentes_inicial()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.agentes (org_id, agente, ativo, nivel)
  select new.id, p.agente, false, p.nivel
    from public.agentes_padrao() p
  on conflict (org_id, agente) do nothing;
  return new;
end $$;
revoke all on function public.agentes_inicial() from public, anon, authenticated;

drop trigger if exists organizations_agentes on public.organizations;
create trigger organizations_agentes
  after insert on public.organizations
  for each row execute function public.agentes_inicial();
