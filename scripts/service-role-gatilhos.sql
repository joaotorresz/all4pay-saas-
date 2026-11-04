-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA: O QUE A CHAVE DE SERVIÇO GRAVA, OS GATILHOS DEIXAM GRAVAR
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/service-role-gatilhos.sql
--
-- O defeito auditado (04/11/2026, produção): o cron de recorrências grava
-- `movements` com a chave de serviço. Os gatilhos `lancamento_em_categoria_folha`
-- e `lancamento_em_cadastro_vigente` NÃO são SECURITY DEFINER, então leem
-- `categories` e `projects` com os grants de service_role — que a migration
-- 20260818200100 (grants mínimos) tinha revogado. Toda conta recorrente COM
-- categoria caía em `42501 permission denied for table categories`, e o cron
-- só contava "falhas: 25". Nove das catorze recorrências reais não viravam conta.
--
-- O que ela prova (migration 20261104180000):
--   a. GERAL: toda tabela que um gatilho NÃO-definer de `movements` lê tem
--      SELECT para service_role (o próximo gatilho novo cai aqui, pelo nome);
--   b. CAMINHO REAL: como service_role, o título com categoria e projeto
--      grava (a mesma forma do cron);
--   c. DEFEITO PLANTADO: sem o SELECT em categories, o mesmo insert é
--      recusado com 42501 — e a checagem (a) NOMEIA a tabela;
--   d. a superfície continua mínima: service_role só LÊ essas tabelas
--      (nada de insert/update/delete nelas).
--
-- ⚠️ Cada caso num subbloco que termina levantando uma sentinela. Tudo em
-- transação que termina em ROLLBACK.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.tabelas_sem_select_nos_gatilhos(tabela regclass)
returns text[] language sql as $$
  select coalesce(array_agg(distinct m[1] order by m[1]), '{}')
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    cross join lateral regexp_matches(pg_get_functiondef(p.oid), 'from\s+public\.([a-z_]+)', 'gi') m
   where t.tgrelid = tabela and not t.tgisinternal and not p.prosecdef
     and to_regclass('public.' || m[1]) is not null
     and not has_table_privilege('service_role', 'public.' || m[1], 'select');
$$;

do $guarda$
declare
  ana uuid := gen_random_uuid();
  org uuid; cat uuid; proj uuid; conta uuid;
  faltam text[];
  sentinela constant text := 'GUARDA_DESFAZ_CASO';
  falhas text[] := '{}';
  casos int := 0;
begin
  ---------------------------------------------------------------- montagem ---
  insert into auth.users (id, email, raw_user_meta_data)
    values (ana, 'sr-ana@guarda.local', '{"company":"Guarda SR"}');
  select org_id into org from public.organization_members where user_id = ana limit 1;
  if org is null then raise exception 'GUARDA INVÁLIDA: provisionamento não criou empresa'; end if;
  insert into public.categories (org_id, kind, name) values (org, 'despesa', 'Aluguel SR') returning id into cat;
  insert into public.projects (org_id, name) values (org, 'Obra SR') returning id into proj;
  insert into public.financial_accounts (org_id, name, bank) values (org, 'Conta SR', 'Banco SR') returning id into conta;

  ------------------------------------- a. GERAL: o gatilho lê o que pode ----
  casos := casos + 1;
  faltam := pg_temp.tabelas_sem_select_nos_gatilhos('public.movements');
  if cardinality(faltam) > 0 then
    falhas := array_append(falhas, format(
      '(a) gatilho não-definer de movements lê %s sem SELECT de service_role — o cron de recorrências cai em 42501',
      array_to_string(faltam, ', ')));
  end if;

  ------------------------------------- b. CAMINHO REAL (forma do cron) ------
  begin
    casos := casos + 1;
    set local role service_role;
    begin
      insert into public.movements (org_id, account_id, type, amount, due_date, category_id, project_id,
        description, origem, especie, competence_date, review_status, reference_code, reconciled)
      values (org, conta, 'saida', 1500, current_date, cat, proj, 'Aluguel', 'contrato', 'titulo',
        current_date, 'confirmado', 'rec:guarda-sr:' || current_date, false);
    exception when others then
      falhas := array_append(falhas, format('(b) o cron (service_role) não grava título com categoria: [%s] %s', sqlstate, sqlerrm));
    end;
    reset role;
    raise exception '%', sentinela;
  exception when others then
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(b) estourou: %s', sqlerrm)); end if;
  end;

  ------------------------------------- c. DEFEITO PLANTADO ------------------
  begin
    casos := casos + 1;
    revoke select on public.categories from service_role;
    if not ('categories' = any (pg_temp.tabelas_sem_select_nos_gatilhos('public.movements'))) then
      falhas := array_append(falhas, '(c) checagem geral não acusou categories sem SELECT (guarda cega)');
    end if;
    set local role service_role;
    begin
      insert into public.movements (org_id, account_id, type, amount, due_date, category_id,
        description, origem, especie, competence_date, review_status, reference_code, reconciled)
      values (org, conta, 'saida', 1500, current_date, cat, 'Aluguel', 'contrato', 'titulo',
        current_date, 'confirmado', 'rec:guarda-sr-c:' || current_date, false);
      falhas := array_append(falhas, '(c) sem SELECT em categories o insert passou — o caso não reproduz o defeito');
    exception when insufficient_privilege then null;
    end;
    reset role;
    raise exception '%', sentinela;
  exception when others then
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(c) estourou: %s', sqlerrm)); end if;
  end;

  ------------------------------------- d. SUPERFÍCIE MÍNIMA -----------------
  casos := casos + 1;
  if has_table_privilege('service_role', 'public.categories', 'insert,update,delete')
     or has_table_privilege('service_role', 'public.projects', 'insert,update,delete') then
    falhas := array_append(falhas, '(d) service_role ganhou escrita em categories/projects — só a leitura do gatilho é necessária');
  end if;

  if cardinality(falhas) > 0 then
    raise exception E'GUARDA service_role × gatilhos: % de % casos reprovaram\n  %',
      cardinality(falhas), casos, array_to_string(falhas, E'\n  ');
  end if;
  raise notice 'GUARDA service_role × gatilhos: % casos, todos passaram', casos;
end $guarda$;

rollback;
