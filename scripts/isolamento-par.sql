-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA DE ISOLAMENTO — DUAS EMPRESAS, DOIS USUÁRIOS
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/isolamento-par.sql
--   (ou `npm run isolamento`)
--
-- ⚠️ Ela existe porque `teste_isolamento_completo()` responde "eu, agora,
-- consigo alcançar dado alheio?" — o que é a pergunta certa em produção e a
-- pergunta ERRADA num pipeline: lá não há dado alheio nenhum, então ela
-- passaria num banco vazio sem provar coisa alguma. Aqui as duas empresas são
-- CRIADAS, com dinheiro dentro, e o cruzamento é tentado nos dois sentidos.
--
-- ⚠️ Os usuários entram por `auth.users`, não por INSERT em `organizations`:
-- é o gatilho `on_auth_user_created` que cria a empresa e roda o seed. Montar
-- as empresas à mão testaria um caminho que nenhum cliente percorre — e o
-- defeito que importa mora justamente no provisionamento.
--
-- ⚠️ TUDO roda numa transação que termina em ROLLBACK. Um teste de isolamento
-- que deixa duas empresas de mentira no banco é um teste que suja exatamente o
-- lugar que ele deveria proteger. E por isso ele pode rodar contra o banco de
-- produção sem medo — foi assim que foi medido pela primeira vez.
--
-- ⚠️ Falha com EXCEÇÃO, não com uma tabela de resultados. `ON_ERROR_STOP=1` faz
-- o `psql` devolver código diferente de zero, e é isso que reprova o build.
-- Um script que imprime "VAZOU" e sai com zero é um relatório, não uma guarda.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

begin;

do $guarda$
declare
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  oa uuid; ob uuid; ca uuid; cb uuid;
  n bigint; s numeric; passou boolean;
  falhas text[] := '{}';
begin
  ---------------------------------------------------------------- montagem ---
  insert into auth.users (id, email, aud, role)
  values (ua, 'isolamento-a@guarda.local', 'authenticated', 'authenticated');
  insert into auth.users (id, email, aud, role)
  values (ub, 'isolamento-b@guarda.local', 'authenticated', 'authenticated');

  select org_id into oa from public.organization_members where user_id = ua limit 1;
  select org_id into ob from public.organization_members where user_id = ub limit 1;

  -- ⚠️ Sem esta conferência a guarda inteira vira teatro: se o gatilho de
  -- provisionamento parar de criar a empresa, todas as tentativas abaixo dariam
  -- zero linhas — e "não vazou" seria indistinguível de "não havia nada".
  if oa is null or ob is null or oa = ob then
    raise exception 'GUARDA INVÁLIDA: o provisionamento não criou duas empresas distintas (A=%, B=%). Nada abaixo prova coisa alguma.', oa, ob;
  end if;

  select id into ca from public.financial_accounts where org_id = oa limit 1;
  select id into cb from public.financial_accounts where org_id = ob limit 1;
  if ca is null or cb is null then
    raise exception 'GUARDA INVÁLIDA: o seed não criou conta bancária para uma das empresas.';
  end if;

  insert into public.movements (org_id, account_id, type, amount, description, status, due_date)
  values (oa, ca, 'entrada', 1111.11, 'segredo da empresa A', 'pago', current_date);
  insert into public.movements (org_id, account_id, type, amount, description, status, due_date)
  values (ob, cb, 'entrada', 2222.22, 'segredo da empresa B', 'pago', current_date);

  --------------------------------------------------------------- LEITURA ----
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.movements where org_id = ob;
  reset role;
  if n > 0 then falhas := falhas || format('A lê %s lançamento(s) da empresa B', n); end if;

  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.movements where org_id = oa;
  reset role;
  if n > 0 then falhas := falhas || format('B lê %s lançamento(s) da empresa A', n); end if;

  ------------------------------------------------------------- AGREGAÇÃO ----
  -- ⚠️ Pergunta própria: uma soma devolve o FATO sem devolver a LINHA. Quanto a
  -- empresa vizinha faturou é resposta que uma política mal escrita entrega sem
  -- vazar um único registro — e nenhuma contagem de linhas a enxerga.
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select coalesce(sum(amount), 0) into s
    from public.movements where description = 'segredo da empresa B';
  reset role;
  if s <> 0 then falhas := falhas || format('A soma R$%s da empresa B', s); end if;

  ---------------------------------------------------------------- ESCRITA ---
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.movements (org_id, account_id, type, amount, description, status, due_date)
    values (ob, cb, 'saida', 9.99, 'invasão', 'pago', current_date);
    passou := true;
  exception when others then
    passou := false;
  end;
  reset role;
  if passou then falhas := falhas || 'A gravou um lançamento na empresa B'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update public.movements set amount = 0 where org_id = ob;
    get diagnostics n = row_count;
  exception when insufficient_privilege then
    n := 0;   -- sem a concessão, nem chega a tentar
  end;
  reset role;
  if n > 0 then falhas := falhas || format('A alterou %s lançamento(s) da empresa B', n); end if;

  -- ⚠️ Exclusão tem teste próprio porque `with check` NÃO a cobre: uma tabela
  -- pode recusar a escrita e ainda aceitar o apagamento, e apagar é a forma
  -- mais completa de alterar.
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  --
  -- ⚠️ O `begin/exception` aqui NÃO é zelo: sem ele, a ONDA 3 derrubou esta
  -- guarda inteira. Ao revogar o `DELETE` do papel do cliente, este `delete`
  -- passou a levantar `42501`, o plpgsql não tratava, e o bloco morria — que é
  -- EXATAMENTE o defeito que a ONDA 2 corrigiu em `teste_isolamento()`,
  -- reaparecendo dentro da guarda escrita para substituí-lo. Uma tentativa que
  -- nem começa é a resposta MAIS forte que existe (fechado por concessão, e não
  -- por política), e ela tem de virar resultado, nunca exceção.
  set local role authenticated;
  begin
    delete from public.movements where org_id = ob;
    get diagnostics n = row_count;
  exception when insufficient_privilege then
    n := 0;
  end;
  reset role;
  if n > 0 then falhas := falhas || format('A apagou %s lançamento(s) da empresa B', n); end if;

  ------------------------------------------- a varredura inteira, dos dois ---
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.teste_isolamento_completo() where vazou;
  reset role;
  if n > 0 then falhas := falhas || format('a varredura por verbo achou %s vazamento(s) como A', n); end if;

  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.teste_isolamento_completo() where vazou;
  reset role;
  if n > 0 then falhas := falhas || format('a varredura por verbo achou %s vazamento(s) como B', n); end if;

  ----------------------------------------------------------------- veredicto -
  if array_length(falhas, 1) > 0 then
    raise exception E'ISOLAMENTO ROMPIDO — % ocorrência(s):\n  · %',
      array_length(falhas, 1), array_to_string(falhas, E'\n  · ');
  end if;

  raise notice 'isolamento: 2 empresas · 2 usuários · 8 cruzamentos tentados · 0 passaram';
end;
$guarda$;

-- ⚠️ ROLLBACK, sempre. Ver a nota do topo: uma guarda que deixa rastro suja o
-- lugar que ela existe para proteger.
rollback;
