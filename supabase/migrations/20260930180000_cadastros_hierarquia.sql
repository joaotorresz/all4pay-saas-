-- ═══════════════════════════════════════════════════════════════════════════
-- OS CADASTROS PASSAM A MORAR NO BANCO — e a hierarquia vira regra do banco
-- (30/09/2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Contas bancárias, centros de custo, projetos e plano de contas moravam em
-- `org_state`/`localStorage` com id NUMÉRICO próprio, enquanto os lançamentos
-- apontam para tabelas com UUID. As duas moradas só se encontravam pelo nome,
-- ou não se encontravam. Medido: a tela "Contas bancárias" dizia "Nenhuma
-- conta cadastrada" numa empresa com 4 contas, e um projeto ou centro escolhido
-- num lançamento em produção era RECUSADO (o id "5001" não é UUID) com a
-- mensagem "abra Cadastros e crie-o de novo" — só que Cadastros gravava no
-- mesmo navegador. Não havia saída.
--
-- A partir daqui a MORADA ÚNICA de cada cadastro é a tabela:
--
--   · `financial_accounts` ganha o que a tela de contas pede (tipo, agência,
--     número, código contábil, dias da fatura do cartão, saldo de abertura
--     conferido, ativo) — com CHECK dos dias quando é cartão e nome único por
--     empresa entre as vivas;
--   · `cost_centers` ganha código, código contábil, descrição e GRUPO
--     (`parent_id`, auto-referência da MESMA empresa);
--   · `projects` ganha cliente, centro responsável e situação (ativo ×
--     encerrado);
--   · `categories` ganha código e unicidade por (empresa, grupo, nome);
--   · `parties` troca o índice GLOBAL do documento por um POR EMPRESA e ganha
--     `ativo` e `default_category_id`;
--   · `categoria_uso_padrao` guarda o "Uso padrão" (função automática →
--     categoria) que a tela de plano de contas gravava no `org_state`.
--
-- E as regras que a tela sozinha não segura, no banco (errcode A4P05, mensagem
-- em português, com o que fazer no `hint`):
--
--   · lançamento, rateio e recorrência só em categoria FOLHA;
--   · categoria com lançamento não vira grupo, e não vai para a lixeira;
--   · grupo com subcategoria viva não vai para a lixeira;
--   · lançamento NOVO não entra em conta inativa nem em projeto encerrado.
--
-- ⚠️ NATUREZA TROCADA NÃO É RECUSADA, de propósito. Uma entrada numa categoria
-- de despesa é o ESTORNO legítimo de uma despesa, e o DRE já a trata (ela
-- abate a linha). Recusar aqui barraria o caso certo para prevenir um caso
-- que o relatório já mostra.
--
-- ⚠️ A migration SE RECUSA, nomeando, quando a unicidade nova reprovaria dado
-- que existe (conta com nome repetido na mesma empresa, contato com o mesmo
-- documento na mesma empresa, cópia de categoria que alguém usa). Medido em
-- produção em 30/09: zero casos nos dois primeiros; 16 grupos de categorias
-- repetidas, TODAS sem lançamento, rateio, recorrência, produto ou serviço —
-- essas cópias vão para a lixeira com o motivo escrito, e a mais antiga fica.
--
-- Idempotente: `if not exists` nas colunas e índices, `drop … if exists` antes
-- de recriar restrição, gatilho e política.

/* ─────────────────────────────────────────────────────────────────────────
   0. PRÉ-CONDIÇÕES — o que a unicidade nova recusaria, dito ANTES dela.
   ───────────────────────────────────────────────────────────────────────── */

do $recusa$
declare
  v_contas text;
  v_docs   text;
begin
  select string_agg(format('%s (empresa %s, %s vezes)', nome, org_id, n), '; ')
    into v_contas
    from (select org_id, lower(btrim(name)) as nome, count(*) as n
            from public.financial_accounts
           where excluido_em is null
           group by 1, 2 having count(*) > 1) x;
  if v_contas is not null then
    raise exception using
      errcode = 'A4P05',
      message = 'CADASTROS: há conta bancária com o MESMO NOME dentro da mesma empresa: ' || v_contas,
      hint = 'O nome passa a ser único por empresa (é por ele que a pessoa escolhe a conta). '
             'Renomeie ou mande uma delas para a lixeira antes de aplicar — esta migration '
             'não escolhe sozinha qual conta, com saldo e lançamentos, deixa de existir.';
  end if;

  select string_agg(format('%s (empresa %s, %s vezes)', doc_digits, org_id, n), '; ')
    into v_docs
    from (select org_id, doc_digits, count(*) as n
            from public.parties
           where doc_digits <> '' and excluido_em is null
           group by 1, 2 having count(*) > 1) x;
  if v_docs is not null then
    raise exception using
      errcode = 'A4P05',
      message = 'CADASTROS: há contato com o MESMO DOCUMENTO dentro da mesma empresa: ' || v_docs,
      hint = 'O documento passa a ser único por empresa. Una os dois cadastros antes de aplicar.';
  end if;
end
$recusa$;

/*
   0b. As cópias de categoria.

   ⚠️ Medido em produção (30/09): 16 grupos de nome repetido em 2 empresas —
   "Vendas" ×5, "Aluguel" ×5, "Folha de pagamento" ×5… —, criados no mesmo dia
   por importações repetidas de antes da deduplicação do `fdip`. NENHUMA cópia é
   usada por nada. A mais antiga de cada grupo FICA; as outras vão para a
   LIXEIRA (exclusão lógica, com o motivo escrito — voltam se alguém quiser).

   Uma cópia que ALGUÉM USA não é cópia descartável: lançamento, rateio,
   recorrência, produto, serviço, subcategoria ou uma linha do DRE diferente da
   que fica. Havendo uma só assim, a migration inteira é RECUSADA, nomeando —
   decidir qual das duas é a certa é trabalho de gente.
*/
do $copias$
declare
  v_bloqueio text;
  v_n int;
begin
  with grupos as (
    select c.id, c.org_id, c.name, c.dre_linha,
           row_number() over w as ordem,
           first_value(c.dre_linha) over w as dre_que_fica
      from public.categories c
     where c.excluido_em is null
    window w as (partition by c.org_id,
                              coalesce(c.parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
                              lower(btrim(c.name))
                 order by c.created_at, c.id)
  ), copias as (
    select g.* from grupos g where g.ordem > 1
  )
  select string_agg(format('"%s" (empresa %s)', cp.name, cp.org_id), '; ')
    into v_bloqueio
    from copias cp
   where exists (select 1 from public.movements m        where m.category_id = cp.id)
      or exists (select 1 from public.movement_splits s  where s.category_id = cp.id)
      or exists (select 1 from public.recurrences r      where r.category_id = cp.id)
      or exists (select 1 from public.products p         where p.category_id = cp.id)
      or exists (select 1 from public.services s         where s.category_id = cp.id)
      or exists (select 1 from public.categories f       where f.parent_id  = cp.id)
      or (cp.dre_linha is not null and cp.dre_linha is distinct from cp.dre_que_fica);

  if v_bloqueio is not null then
    raise exception using
      errcode = 'A4P05',
      message = 'CADASTROS: há categoria repetida (mesmo nome, mesmo grupo, mesma empresa) que ESTÁ EM USO: ' || v_bloqueio,
      hint = 'Mova os lançamentos, rateios, recorrências, produtos e subcategorias para uma só das '
             'cópias e mande as outras para a lixeira antes de aplicar. A migration só descarta '
             'cópia que ninguém usa.';
  end if;

  with grupos as (
    select c.id,
           row_number() over (partition by c.org_id,
                                           coalesce(c.parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
                                           lower(btrim(c.name))
                              order by c.created_at, c.id) as ordem
      from public.categories c
     where c.excluido_em is null
  )
  update public.categories c
     set excluido_em = now(),
         excluido_motivo = 'Cópia repetida do mesmo nome, no mesmo grupo e na mesma empresa, sem '
                           'nenhum lançamento, rateio, recorrência, produto ou serviço apontando '
                           'para ela. A mais antiga ficou; esta foi para a lixeira para o plano de '
                           'contas ter um nome por categoria (migration 20260930180000).'
    from grupos g
   where g.id = c.id and g.ordem > 1;
  get diagnostics v_n = row_count;
  raise notice 'cadastros: % cópia(s) repetida(s) de categoria foram para a lixeira (sem uso nenhum).', v_n;
end
$copias$;

/* ─────────────────────────────────────────────────────────────────────────
   1. CONTAS BANCÁRIAS — `financial_accounts` recebe o que a tela pede
   ───────────────────────────────────────────────────────────────────────── */

alter table public.financial_accounts
  add column if not exists tipo                    text not null default 'corrente',
  add column if not exists agencia                 text,
  add column if not exists numero                  text,
  add column if not exists codigo_contabil         text,
  add column if not exists dia_fechamento          smallint,
  add column if not exists dia_vencimento          smallint,
  add column if not exists saldo_inicial           numeric(14,2),
  add column if not exists data_saldo_inicial      date,
  add column if not exists saldo_inicial_conferido boolean not null default false,
  add column if not exists ativo                   boolean not null default true;

comment on column public.financial_accounts.tipo is
  'corrente · poupanca · investimento · cartao · outro. Cartão exige os dois dias da fatura.';
comment on column public.financial_accounts.codigo_contabil is
  'Código da conta no sistema contábil (Domínio) — sai no TXT contábil.';
comment on column public.financial_accounts.saldo_inicial_conferido is
  'Confirmação EXPLÍCITA de que saldo_inicial/data_saldo_inicial são a abertura real da conta. '
  'Só com ela a conta vira a fonte "informada" da abertura conferida do Razão.';
comment on column public.financial_accounts.ativo is
  'Conta inativa sai das escolhas e não recebe lançamento NOVO; o histórico dela continua.';

alter table public.financial_accounts drop constraint if exists financial_accounts_tipo_valido;
alter table public.financial_accounts add constraint financial_accounts_tipo_valido
  check (tipo in ('corrente', 'poupanca', 'investimento', 'cartao', 'outro'));

-- ⚠️ A regra que dá caráter à tela: o cartão SEM os dois dias da fatura seria
-- uma conta que nunca fecha nem vence, e a fatura dele nunca apareceria.
alter table public.financial_accounts drop constraint if exists financial_accounts_dias_do_cartao;
alter table public.financial_accounts add constraint financial_accounts_dias_do_cartao
  check (
    (dia_fechamento is null or dia_fechamento between 1 and 31)
    and (dia_vencimento is null or dia_vencimento between 1 and 31)
    and (tipo <> 'cartao' or (dia_fechamento is not null and dia_vencimento is not null))
  );

-- ⚠️ "Conferido" sem valor e data é o `0`/hoje de fábrica fingindo abertura.
alter table public.financial_accounts drop constraint if exists financial_accounts_conferido_tem_saldo;
alter table public.financial_accounts add constraint financial_accounts_conferido_tem_saldo
  check (not saldo_inicial_conferido or (saldo_inicial is not null and data_saldo_inicial is not null));

create unique index if not exists financial_accounts_org_nome_unico
  on public.financial_accounts (org_id, lower(btrim(name)))
  where excluido_em is null;

/* ─────────────────────────────────────────────────────────────────────────
   2. CENTROS DE CUSTO — código, código contábil, descrição e GRUPO
   ───────────────────────────────────────────────────────────────────────── */

alter table public.cost_centers
  add column if not exists code            text,
  add column if not exists codigo_contabil text,
  add column if not exists parent_id       uuid references public.cost_centers(id) on delete set null,
  add column if not exists description     text;

comment on column public.cost_centers.parent_id is
  'O centro-GRUPO (sintético) a que este pertence — sempre da MESMA empresa, sem ciclo.';
comment on column public.cost_centers.codigo_contabil is
  'Código do centro no sistema contábil (Domínio) — sai nas colunas CC do TXT.';

create index if not exists cost_centers_parent_idx
  on public.cost_centers (parent_id) where parent_id is not null;
create unique index if not exists cost_centers_org_codigo_unico
  on public.cost_centers (org_id, lower(btrim(code)))
  where code is not null and btrim(code) <> '' and excluido_em is null;

create or replace function public.centro_custo_hierarquia()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_org_pai uuid;
  v_cursor  uuid;
  v_passos  int := 0;
begin
  if new.parent_id is null then return new; end if;

  if new.parent_id = new.id then
    raise exception using errcode = 'A4P05',
      message = format('O centro de custo "%s" não pode ser o grupo de si mesmo.', new.name);
  end if;

  -- ⚠️ A chave estrangeira aceita o id de OUTRA empresa; é aqui que a mesma
  -- empresa é exigida. Invocador: a política de linha esconde o de fora, e
  -- "não encontrado" é a resposta certa para os dois casos.
  select org_id into v_org_pai
    from public.cost_centers where id = new.parent_id and excluido_em is null;
  if v_org_pai is null or v_org_pai <> new.org_id then
    raise exception using errcode = 'A4P05',
      message = 'O centro de custo escolhido como grupo não existe nesta empresa.',
      hint = 'Escolha um grupo da lista de centros desta empresa.';
  end if;

  v_cursor := new.parent_id;
  while v_cursor is not null and v_passos < 64 loop
    if v_cursor = new.id then
      raise exception using errcode = 'A4P05',
        message = format('Pôr "%s" dentro deste grupo fecharia um ciclo na árvore de centros.', new.name),
        hint = 'Um centro não pode ficar dentro de um dos seus próprios subcentros.';
    end if;
    select parent_id into v_cursor from public.cost_centers where id = v_cursor;
    v_passos := v_passos + 1;
  end loop;

  return new;
end $$;

drop trigger if exists centros_hierarquia on public.cost_centers;
create trigger centros_hierarquia
  before insert or update of parent_id, org_id on public.cost_centers
  for each row execute function public.centro_custo_hierarquia();

/* ─────────────────────────────────────────────────────────────────────────
   3. PROJETOS — cliente, centro responsável e situação
   ───────────────────────────────────────────────────────────────────────── */

alter table public.projects
  add column if not exists party_id       uuid references public.parties(id) on delete set null,
  add column if not exists cost_center_id uuid references public.cost_centers(id) on delete set null,
  add column if not exists status         text not null default 'ativo';

comment on column public.projects.status is
  'ativo · encerrado. Projeto encerrado não recebe lançamento NOVO.';

alter table public.projects drop constraint if exists projects_status_valido;
alter table public.projects add constraint projects_status_valido
  check (status in ('ativo', 'encerrado'));

create or replace function public.projeto_vinculos_da_empresa()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.party_id is not null and not exists (
    select 1 from public.parties where id = new.party_id and org_id = new.org_id and excluido_em is null
  ) then
    raise exception using errcode = 'A4P05',
      message = format('O cliente escolhido para o projeto "%s" não existe nesta empresa.', new.name);
  end if;
  if new.cost_center_id is not null and not exists (
    select 1 from public.cost_centers where id = new.cost_center_id and org_id = new.org_id and excluido_em is null
  ) then
    raise exception using errcode = 'A4P05',
      message = format('O centro de custo escolhido para o projeto "%s" não existe nesta empresa.', new.name);
  end if;
  return new;
end $$;

drop trigger if exists projetos_vinculos on public.projects;
create trigger projetos_vinculos
  before insert or update of party_id, cost_center_id, org_id on public.projects
  for each row execute function public.projeto_vinculos_da_empresa();

/* ─────────────────────────────────────────────────────────────────────────
   4. PLANO DE CONTAS — `categories` é a árvore (grupo → categoria folha)
   ───────────────────────────────────────────────────────────────────────── */

alter table public.categories
  add column if not exists code text;

comment on column public.categories.code is
  'Código da categoria no plano (ex.: 3.1.01) — o Domínio casa por ele.';

create index if not exists categories_parent_idx
  on public.categories (parent_id) where parent_id is not null;

-- ⚠️ `coalesce` no pai: num índice único, NULL é diferente de NULL, e sem ele
-- duas categorias "Aluguel" na RAIZ passariam — que é justamente onde as 16
-- cópias medidas em produção estavam.
create unique index if not exists categories_org_pai_nome_unico
  on public.categories (org_id,
                        coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
                        lower(btrim(name)))
  where excluido_em is null;

create unique index if not exists categories_org_codigo_unico
  on public.categories (org_id, lower(btrim(code)))
  where code is not null and btrim(code) <> '' and excluido_em is null;

-- O que conta como LANÇAMENTO de uma categoria: título, rateio e recorrência
-- vivos. É a mesma lista nos três gatilhos abaixo — uma função só.
create or replace function public.categoria_lancamentos(p_categoria uuid)
returns bigint language sql stable
set search_path = public, pg_temp
as $$
  select (select count(*) from public.movements       where category_id = p_categoria and excluido_em is null)
       + (select count(*) from public.movement_splits where category_id = p_categoria and excluido_em is null)
       + (select count(*) from public.recurrences     where category_id = p_categoria and excluido_em is null)
$$;

create or replace function public.categoria_hierarquia()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_org_pai  uuid;
  v_nome_pai text;
  v_cursor   uuid;
  v_passos   int := 0;
  v_lanc     bigint;
begin
  if new.parent_id is null then return new; end if;

  if new.parent_id = new.id then
    raise exception using errcode = 'A4P05',
      message = format('A categoria "%s" não pode ser o grupo de si mesma.', new.name);
  end if;

  select org_id, name into v_org_pai, v_nome_pai
    from public.categories where id = new.parent_id and excluido_em is null;
  if v_org_pai is null or v_org_pai <> new.org_id then
    raise exception using errcode = 'A4P05',
      message = 'O grupo escolhido não existe no plano de contas desta empresa.',
      hint = 'Escolha um grupo da árvore desta empresa.';
  end if;

  v_cursor := new.parent_id;
  while v_cursor is not null and v_passos < 64 loop
    if v_cursor = new.id then
      raise exception using errcode = 'A4P05',
        message = format('Pôr "%s" dentro de "%s" fecharia um ciclo no plano de contas.', new.name, v_nome_pai);
    end if;
    select parent_id into v_cursor from public.categories where id = v_cursor;
    v_passos := v_passos + 1;
  end loop;

  -- ⚠️ Uma categoria com lançamento NÃO vira grupo. Se virasse, os lançamentos
  -- dela ficariam pendurados num nível que o DRE não detalha: o valor apareceria
  -- no total do grupo sem pertencer a nenhuma das subcategorias que o compõem.
  v_lanc := public.categoria_lancamentos(new.parent_id);
  if v_lanc > 0 then
    raise exception using errcode = 'A4P05',
      message = format('A categoria "%s" já tem %s lançamento(s) e não pode virar grupo.', v_nome_pai, v_lanc),
      hint = format('Crie um grupo novo, mova "%s" para dentro dele e crie a subcategoria ao lado — '
                    'assim os lançamentos continuam numa categoria que o DRE detalha.', v_nome_pai);
  end if;

  return new;
end $$;

drop trigger if exists categorias_hierarquia on public.categories;
create trigger categorias_hierarquia
  before insert or update of parent_id, org_id on public.categories
  for each row execute function public.categoria_hierarquia();

-- ⚠️ A lixeira de categoria: quem tem lançamento não vai (o lançamento ficaria
-- apontando para uma categoria invisível, e o DRE o classificaria por palpite),
-- e grupo com subcategoria viva também não (as filhas ficariam penduradas num
-- pai que ninguém vê). O caminho para "parar de usar" é DESATIVAR.
create or replace function public.categoria_exclusao()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_lanc   bigint;
  v_filhas int;
begin
  if old.excluido_em is not null or new.excluido_em is null then return new; end if;

  v_lanc := public.categoria_lancamentos(new.id);
  if v_lanc > 0 then
    raise exception using errcode = 'A4P05',
      message = format('A categoria "%s" tem %s lançamento(s) e não pode ir para a lixeira.', new.name, v_lanc),
      hint = 'Desative a categoria para ela sair das escolhas sem perder o histórico, '
             'ou mova os lançamentos para outra categoria antes.';
  end if;

  select count(*) into v_filhas from public.categories where parent_id = new.id and excluido_em is null;
  if v_filhas > 0 then
    raise exception using errcode = 'A4P05',
      message = format('O grupo "%s" ainda tem %s subcategoria(s) viva(s).', new.name, v_filhas),
      hint = 'Mande as subcategorias para a lixeira primeiro — senão elas ficariam penduradas num grupo que ninguém vê.';
  end if;
  return new;
end $$;

drop trigger if exists categorias_exclusao on public.categories;
create trigger categorias_exclusao
  before update of excluido_em on public.categories
  for each row execute function public.categoria_exclusao();

/* ─────────────────────────────────────────────────────────────────────────
   5. LANÇAMENTO SÓ EM FOLHA — título, rateio e recorrência
   ───────────────────────────────────────────────────────────────────────── */

create or replace function public.lancamento_em_categoria_folha()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_filhas int;
  v_nome   text;
begin
  if new.category_id is null then return new; end if;
  -- Só quando a categoria MUDA: editar a descrição de um título antigo não
  -- pode reprovar por causa de uma árvore que mudou depois dele.
  if tg_op = 'UPDATE' and new.category_id is not distinct from old.category_id then return new; end if;

  select count(*) into v_filhas
    from public.categories where parent_id = new.category_id and excluido_em is null;
  if v_filhas > 0 then
    select name into v_nome from public.categories where id = new.category_id;
    raise exception using errcode = 'A4P05',
      message = format('A categoria "%s" é um grupo (%s subcategoria(s)) e não recebe lançamento.',
                       coalesce(v_nome, '?'), v_filhas),
      hint = 'Escolha uma das subcategorias. Lançar no grupo faria o valor aparecer no total '
             'sem pertencer a nenhuma das linhas que o compõem.';
  end if;
  return new;
end $$;

drop trigger if exists lancamento_categoria_folha on public.movements;
create trigger lancamento_categoria_folha
  before insert or update of category_id on public.movements
  for each row execute function public.lancamento_em_categoria_folha();

drop trigger if exists rateio_categoria_folha on public.movement_splits;
create trigger rateio_categoria_folha
  before insert or update of category_id on public.movement_splits
  for each row execute function public.lancamento_em_categoria_folha();

drop trigger if exists recorrencia_categoria_folha on public.recurrences;
create trigger recorrencia_categoria_folha
  before insert or update of category_id on public.recurrences
  for each row execute function public.lancamento_em_categoria_folha();

/*
   Lançamento NOVO em conta inativa ou projeto encerrado: recusado.

   ⚠️ Só no INSERT. Editar ou baixar um título antigo de uma conta que foi
   desativada depois dele é trabalho legítimo sobre o histórico.
   ⚠️ O ESTORNO passa: ele não cria negócio novo, desfaz um que existiu — e
   exigir reativar a conta para corrigir o passado dela seria o avesso.
*/
create or replace function public.lancamento_em_cadastro_vigente()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ativo  boolean;
  v_status text;
  v_nome   text;
begin
  if new.estorno_de is not null then return new; end if;

  if new.account_id is not null then
    select ativo, name into v_ativo, v_nome from public.financial_accounts where id = new.account_id;
    if v_ativo is false then
      raise exception using errcode = 'A4P05',
        message = format('A conta "%s" está inativa e não recebe lançamento novo.', v_nome),
        hint = 'Reative a conta em Cadastros › Contas bancárias, ou escolha outra conta. '
               'Desativar existe para a conta sair das escolhas sem apagar o histórico dela.';
    end if;
  end if;

  if new.project_id is not null then
    select status, name into v_status, v_nome from public.projects where id = new.project_id;
    if v_status = 'encerrado' then
      raise exception using errcode = 'A4P05',
        message = format('O projeto "%s" está encerrado e não recebe lançamento novo.', v_nome),
        hint = 'Se o lançamento é mesmo deste projeto, reabra-o em Cadastros › Projetos; '
               'senão, escolha outro projeto ou deixe o campo vazio.';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists lancamento_cadastro_vigente on public.movements;
create trigger lancamento_cadastro_vigente
  before insert on public.movements
  for each row execute function public.lancamento_em_cadastro_vigente();

/* ─────────────────────────────────────────────────────────────────────────
   6. CLIENTES E FORNECEDORES — documento único POR EMPRESA
   ───────────────────────────────────────────────────────────────────────── */

-- ⚠️ Confirmado em produção em 30/09: `parties_doc_unique` era único sobre
-- `doc_digits` SEM `org_id`. Duas empresas não conseguiam cadastrar o mesmo
-- cliente, e o erro revelava a uma empresa que o documento existe NOUTRA — um
-- vazamento entre clientes por mensagem de erro. O novo é por empresa, entre os
-- vivos (um contato na lixeira não trava o recadastro).
create unique index if not exists parties_org_doc_unico
  on public.parties (org_id, doc_digits)
  where doc_digits <> '' and excluido_em is null;
drop index if exists public.parties_doc_unique;

alter table public.parties
  add column if not exists ativo               boolean not null default true,
  add column if not exists default_category_id uuid references public.categories(id) on delete set null;

comment on column public.parties.ativo is
  'Contato inativo sai das escolhas; o histórico dele continua.';
comment on column public.parties.default_category_id is
  'A categoria que o formulário de lançamento sugere para este contato (UUID de categories, nunca o id local).';

create or replace function public.parte_categoria_padrao_da_empresa()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.default_category_id is not null and not exists (
    select 1 from public.categories
     where id = new.default_category_id and org_id = new.org_id and excluido_em is null
  ) then
    raise exception using errcode = 'A4P05',
      message = format('A categoria padrão escolhida para "%s" não existe no plano de contas desta empresa.', new.name);
  end if;
  return new;
end $$;

drop trigger if exists partes_categoria_padrao on public.parties;
create trigger partes_categoria_padrao
  before insert or update of default_category_id, org_id on public.parties
  for each row execute function public.parte_categoria_padrao_da_empresa();

/* ─────────────────────────────────────────────────────────────────────────
   7. USO PADRÃO — função automática → categoria, no banco
   ───────────────────────────────────────────────────────────────────────── */

-- Era `org_state.a4p_plano_usos`, apontando para o id LOCAL do plano. Uma linha
-- por (empresa, função); `category_id` nulo = função sem categoria escolhida.
-- Sem DELETE para o cliente, como toda tabela de negócio: "tirar" é anular.
create table if not exists public.categoria_uso_padrao (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  funcao        text not null,
  category_id   uuid references public.categories(id) on delete set null,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid(),
  constraint categoria_uso_padrao_funcao_unica unique (org_id, funcao)
);

comment on table public.categoria_uso_padrao is
  'Uso padrão do plano de contas: qual categoria cada função automática (receita padrão, taxa de '
  'plataforma, chargeback…) usa. Uma categoria por função e por empresa.';

alter table public.categoria_uso_padrao enable row level security;
drop policy if exists "org rw categoria_uso_padrao" on public.categoria_uso_padrao;
create policy "org rw categoria_uso_padrao" on public.categoria_uso_padrao
  for all to authenticated
  using (org_id = public.auth_org_id())
  with check (org_id = public.auth_org_id());

revoke all on table public.categoria_uso_padrao from anon;
revoke delete, truncate, references, trigger on table public.categoria_uso_padrao from authenticated;
grant select, insert, update on table public.categoria_uso_padrao to authenticated;

create or replace function public.uso_padrao_em_folha_da_empresa()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.atualizado_em := now();
  if new.category_id is null then return new; end if;
  if not exists (
    select 1 from public.categories
     where id = new.category_id and org_id = new.org_id and excluido_em is null
  ) then
    raise exception using errcode = 'A4P05',
      message = 'A categoria escolhida para o uso padrão não existe no plano de contas desta empresa.';
  end if;
  if exists (select 1 from public.categories where parent_id = new.category_id and excluido_em is null) then
    raise exception using errcode = 'A4P05',
      message = 'O uso padrão precisa de uma categoria FOLHA, não de um grupo.',
      hint = 'Um lançamento automático classificado num grupo cairia num nível que o DRE não detalha.';
  end if;
  return new;
end $$;

drop trigger if exists usos_padrao_folha on public.categoria_uso_padrao;
create trigger usos_padrao_folha
  before insert or update on public.categoria_uso_padrao
  for each row execute function public.uso_padrao_em_folha_da_empresa();

-- A trilha: toda tabela de negócio tem o gatilho de auditoria (a guarda
-- `trilha-completa.sql` reprova a que não tiver).
drop trigger if exists zz_auditar_categoria_uso_padrao on public.categoria_uso_padrao;
create trigger zz_auditar_categoria_uso_padrao
  after insert or update or delete on public.categoria_uso_padrao
  for each row execute function public.auditar_escrita();

/* ─────────────────────────────────────────────────────────────────────────
   8. IMPOSTOS PROVISIONADOS — uma conta a pagar por (empresa, competência,
      imposto), cobrada pelo BANCO
   ───────────────────────────────────────────────────────────────────────── */

-- ⚠️ "Criar contas a pagar" dos impostos passou a gravar em produção (antes
-- não gravava nada). A idempotência da tela é CONSULTAR antes de inserir, e
-- isso não segura dois cliques seguidos nem duas abas: os dois leem "não
-- existe" e os dois inserem — o DAS do mês entraria DUAS vezes no contas a
-- pagar, no fluxo e no DRE. O índice parcial (mesmo desenho de `rec:%` e
-- `pluggy:%`) faz o segundo insert ser recusado.
-- Recusa nomeando, e não apaga, se algum dia já houver repetição: decidir qual
-- das duas guias fica é trabalho de gente.
do $imp$
declare v_rep text;
begin
  select string_agg(format('%s (empresa %s, %s vezes)', reference_code, org_id, n), '; ')
    into v_rep
    from (select org_id, reference_code, count(*) as n
            from public.movements
           where reference_code like 'imp:%'
           group by 1, 2 having count(*) > 1) x;
  if v_rep is not null then
    raise exception using
      errcode = 'A4P05',
      message = 'CADASTROS: há imposto provisionado REPETIDO (mesma competência, mesmo imposto): ' || v_rep,
      hint = 'Mande a cópia para a lixeira (ou estorne) antes de aplicar — a migration não escolhe qual guia fica.';
  end if;
end
$imp$;

create unique index if not exists movements_imp_ref_uniq
  on public.movements (org_id, reference_code)
  where reference_code like 'imp:%';
