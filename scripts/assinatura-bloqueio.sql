-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA DO BLOQUEIO SUAVE — vencido PARA de escrever e CONTINUA lendo
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/assinatura-bloqueio.sql
--
-- ⚠️ **As DUAS metades são a regra, e cada uma sem a outra é um defeito
-- diferente.** Só a primeira metade (escrita bloqueada) descreve um produto que
-- pode ter apagado o arquivo do cliente; só a segunda (leitura livre) descreve
-- um produto que não cobra. É por isso que este script afirma sobre as duas na
-- mesma execução, sobre a MESMA organização.
--
-- ⚠️ Os usuários entram por `auth.users`, não por INSERT em `organizations` — é
-- o gatilho de signup que provisiona, e agora também é ele que cria a linha de
-- assinatura. Montar à mão testaria um caminho que nenhum cliente percorre, e
-- deixaria justamente o gatilho novo sem cobertura.
--
-- ⚠️ Tudo em transação que termina em ROLLBACK. Falha com EXCEÇÃO — um script
-- que imprime "VAZOU" e sai com zero é relatório, não guarda.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

begin;

do $guarda$
declare
  u uuid := gen_random_uuid();
  o uuid; c uuid;
  n bigint; passou boolean;
  falhas text[] := '{}';
begin
  ---------------------------------------------------------------- montagem ---
  insert into auth.users (id, email, aud, role)
  values (u, 'assinatura@guarda.local', 'authenticated', 'authenticated');

  select org_id into o from public.organization_members where user_id = u limit 1;
  if o is null then
    raise exception 'GUARDA INVÁLIDA: o provisionamento não criou a empresa. Nada abaixo prova coisa alguma.';
  end if;

  -- ⚠️ A primeira asserção é sobre o GATILHO NOVO: sem a linha de assinatura,
  -- tudo abaixo mede um produto sem relógio — que é exatamente o estado que
  -- esta migration veio corrigir, e o teste passaria descrevendo o defeito.
  if not exists (select 1 from public.subscriptions where org_id = o and status = 'trial'
                   and current_period_end is not null) then
    falhas := falhas || 'organização nova nasceu SEM assinatura de teste com data de fim';
  end if;

  select id into c from public.financial_accounts where org_id = o limit 1;
  if c is null then
    raise exception 'GUARDA INVÁLIDA: o seed não criou conta bancária.';
  end if;

  ------------------------------------------------- 1. EM DIA, escreve -------
  -- ⚠️ Sem este caso, a guarda aprovaria um bloqueio que bloqueia TODO MUNDO.
  -- "Ninguém escreve" satisfaz "o vencido não escreve".
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.movements (org_id, account_id, type, amount, description, status, due_date, origem)
    values (o, c, 'entrada', 100.00, 'lançamento dentro do teste', 'pago', current_date, 'manual');
    passou := true;
  exception when others then
    passou := false;
  end;
  reset role;
  if not passou then falhas := falhas || 'organização EM DIA não conseguiu lançar'; end if;

  --------------------------------------------- 2. VENCIDA, não escreve ------
  update public.subscriptions
     set current_period_end = current_date - 1
   where org_id = o;

  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.movements (org_id, account_id, type, amount, description, status, due_date, origem)
    values (o, c, 'saida', 50.00, 'lançamento depois de vencer', 'pago', current_date, 'manual');
    passou := true;
  exception when others then
    passou := false;
  end;
  reset role;
  if passou then falhas := falhas || 'organização VENCIDA gravou um lançamento'; end if;

  -- ⚠️ ALTERAR também é escrever, e `with check` cobre o UPDATE — mas só se a
  -- política existir para o comando. Um produto que impede o INSERT e libera o
  -- UPDATE deixa o cliente vencido reescrever o passado.
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update public.movements set amount = 1 where org_id = o;
    get diagnostics n = row_count;
  exception when others then
    n := 0;
  end;
  reset role;
  if n > 0 then falhas := falhas || format('organização VENCIDA alterou %s lançamento(s)', n); end if;

  -- ⚠️ E APAGAR: `with check` não cobre DELETE, e apagar é a forma mais
  -- completa de alterar. Foi a lição da ONDA 9, e ela vale de novo aqui.
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    delete from public.movements where org_id = o;
    get diagnostics n = row_count;
  exception when others then
    n := 0;
  end;
  reset role;
  if n > 0 then falhas := falhas || format('organização VENCIDA apagou %s lançamento(s)', n); end if;

  ------------------------------------ 3. VENCIDA, CONTINUA LENDO ------------
  -- ⚠️ A metade que impede a cobrança de virar sequestro de arquivo. O dado é
  -- da empresa; vencer suspende o serviço, não confisca o histórico.
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.movements where org_id = o;
  reset role;
  if n < 1 then
    falhas := falhas || 'organização VENCIDA perdeu a LEITURA dos próprios lançamentos';
  end if;

  ------------------------------------ 4. REGULARIZOU, volta a escrever ------
  -- ⚠️ Sem restaurar nada: se voltar exigisse migração de dado, o bloqueio
  -- teria destruído estado, e "suave" seria só o nome.
  update public.subscriptions set current_period_end = current_date + 30 where org_id = o;

  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.movements (org_id, account_id, type, amount, description, status, due_date, origem)
    values (o, c, 'entrada', 7.00, 'depois de regularizar', 'pago', current_date, 'manual');
    passou := true;
  exception when others then
    passou := false;
  end;
  reset role;
  if not passou then
    falhas := falhas || 'organização REGULARIZADA continuou sem conseguir lançar';
  end if;

  ------------------------------------------------------------------ fim -----
  if array_length(falhas, 1) is not null then
    raise exception E'BLOQUEIO SUAVE QUEBRADO:\n  · %', array_to_string(falhas, E'\n  · ');
  end if;

  raise notice '✓ bloqueio suave — em dia escreve · vencida não escreve, não altera, não apaga · vencida LÊ · regularizada volta a escrever';
end
$guarda$;

rollback;
