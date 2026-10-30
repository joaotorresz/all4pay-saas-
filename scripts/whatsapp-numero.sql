-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA: O CELULAR DA QUATTRO AI SÓ VALE CONFIRMADO PELO PRÓPRIO NÚMERO
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/whatsapp-numero.sql
--
-- O que ela prova contra o Postgres de verdade (migration 20261030150000):
--   a. caminho feliz: o código pedido pela chave de serviço confirma pela
--      sessão da pessoa; o hash (não o código) fica no banco, e a trilha não
--      leva o código;
--   b. `authenticated` NÃO gera código (senão o leria sem ter o celular);
--   c. `authenticated` NÃO lê as tabelas direto;
--   d. código de OUTRA pessoa não confirma (o hash é por pessoa);
--   e. 5 erros esgotam o código — nem o certo vale depois;
--   f. código vencido não confirma;
--   g. telefone confirmado por uma pessoa é recusado para a outra;
--   h. telefone que pediu SAIR não recebe código;
--   i. o 4º código na mesma hora é recusado (por pessoa e por telefone);
--   j. quem não administra nenhuma empresa não cadastra;
--   k. trocar de número mantém o confirmado até o novo ser confirmado.
--
-- ⚠️ Cada caso roda num SUBBLOCO que termina levantando uma sentinela — em
-- plpgsql isso é um savepoint desfeito. Todos usam o MESMO telefone: se um
-- caso deixasse estado para o seguinte, apareceria como colisão.
--
-- ⚠️ "Recusado" só conta se a mensagem NOMEAR o defeito auditado.
--
-- Tudo em transação que termina em ROLLBACK. Falha com EXCEÇÃO (ON_ERROR_STOP).
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

begin;

do $guarda$
declare
  ana uuid := gen_random_uuid();
  bia uuid := gen_random_uuid();
  tel constant text := '+55 (11) 99999-7777';   -- o MESMO em todos os casos
  tel2 constant text := '11988886666';
  cod text; cod2 text;
  r jsonb;
  erro text;
  i int;
  sentinela constant text := 'GUARDA_DESFAZ_CASO';
  falhas text[] := '{}';
  casos int := 0;
begin
  ---------------------------------------------------------------- montagem ---
  -- Usuários pelo gatilho de signup: cada um nasce TITULAR da própria empresa.
  insert into auth.users (id, email, raw_user_meta_data) values
    (ana, 'wan-ana@guarda.local', '{"company":"Guarda WAN A"}'),
    (bia, 'wan-bia@guarda.local', '{"company":"Guarda WAN B"}');
  if not exists (select 1 from public.organization_members where user_id = ana) then
    raise exception 'GUARDA INVÁLIDA: provisionamento não criou empresa';
  end if;

  ---------------------------------------------- a. CAMINHO FELIZ --------------
  begin
    casos := casos + 1;
    set local role service_role;
    cod := public.whatsapp_numero_pedir_codigo(ana, tel);
    reset role;
    if cod !~ '^\d{6}$' then
      falhas := array_append(falhas, format('(a) código fora de 6 dígitos: %s', cod));
    end if;
    if exists (select 1 from public.whatsapp_numeros_usuario where codigo_hash = cod) then
      falhas := array_append(falhas, '(a) o código foi gravado em TEXTO');
    end if;
    if exists (select 1 from public.audit_log where acao like 'whatsapp_numero.%' and depois::text like '%' || cod || '%') then
      falhas := array_append(falhas, '(a) o código foi para a trilha de auditoria');
    end if;

    perform set_config('request.jwt.claim.sub', ana::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', ana, 'role', 'authenticated')::text, true);
    set local role authenticated;
    r := public.whatsapp_numero_confirmar(cod);
    reset role;
    if not coalesce((r ->> 'ok')::boolean, false) then
      falhas := array_append(falhas, format('(a) o código legítimo foi recusado: %s', r));
    elsif not exists (select 1 from public.whatsapp_numeros_usuario
                       where user_id = ana and telefone = '11999997777' and confirmado_em is not null) then
      falhas := array_append(falhas, '(a) o telefone não ficou confirmado (canônico, sem o 55)');
    end if;
    if not exists (select 1 from public.audit_log where acao = 'whatsapp_numero.confirmar' and usuario = ana::text) then
      falhas := array_append(falhas, '(a) a confirmação não foi para a trilha');
    end if;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(a) estourou: %s', sqlerrm)); end if;
  end;

  ------------------------------- b. AUTHENTICATED NÃO GERA CÓDIGO -------------
  begin
    casos := casos + 1;
    perform set_config('request.jwt.claim.sub', ana::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', ana, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      cod := public.whatsapp_numero_pedir_codigo(ana, tel);
      reset role;
      falhas := array_append(falhas, '(b) a SESSÃO da pessoa gerou o código — ela o leria sem ter o celular');
    exception when insufficient_privilege then
      reset role;
    end;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(b) estourou: %s', sqlerrm)); end if;
  end;

  ------------------------------- c. AUTHENTICATED NÃO LÊ AS TABELAS -----------
  begin
    casos := casos + 1;
    set local role authenticated;
    begin
      perform 1 from public.whatsapp_numeros_usuario limit 1;
      reset role;
      falhas := array_append(falhas, '(c) authenticated LÊ whatsapp_numeros_usuario direto');
    exception when insufficient_privilege then reset role;
    end;
    set local role authenticated;
    begin
      perform 1 from public.whatsapp_numero_envios limit 1;
      reset role;
      falhas := array_append(falhas, '(c) authenticated LÊ whatsapp_numero_envios direto');
    exception when insufficient_privilege then reset role;
    end;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(c) estourou: %s', sqlerrm)); end if;
  end;

  ---------------------------------- d. CÓDIGO DE OUTRA PESSOA -----------------
  begin
    casos := casos + 1;
    set local role service_role;
    cod := public.whatsapp_numero_pedir_codigo(ana, tel);
    cod2 := public.whatsapp_numero_pedir_codigo(bia, tel2);
    reset role;
    -- a BIA tenta o código da ANA
    perform set_config('request.jwt.claim.sub', bia::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', bia, 'role', 'authenticated')::text, true);
    set local role authenticated;
    r := public.whatsapp_numero_confirmar(cod);
    reset role;
    if cod <> cod2 and coalesce((r ->> 'ok')::boolean, false) then
      falhas := array_append(falhas, '(d) o código da ANA confirmou o número da BIA');
    elsif cod <> cod2 and r ->> 'motivo' not like 'Código incorreto%' then
      falhas := array_append(falhas, format('(d) VERMELHO PELO MOTIVO ERRADO: %s', r ->> 'motivo'));
    end if;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(d) estourou: %s', sqlerrm)); end if;
  end;

  ---------------------------------- e. 5 ERROS ESGOTAM ------------------------
  begin
    casos := casos + 1;
    set local role service_role;
    cod := public.whatsapp_numero_pedir_codigo(ana, tel);
    reset role;
    perform set_config('request.jwt.claim.sub', ana::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', ana, 'role', 'authenticated')::text, true);
    set local role authenticated;
    for i in 1..5 loop
      r := public.whatsapp_numero_confirmar(case when cod = '000000' then '111111' else '000000' end);
    end loop;
    r := public.whatsapp_numero_confirmar(cod);
    reset role;
    if coalesce((r ->> 'ok')::boolean, false) then
      falhas := array_append(falhas, '(e) depois de 5 erros o código certo ainda confirmou (força bruta aberta)');
    elsif r ->> 'motivo' not like 'Tentativas esgotadas%' then
      falhas := array_append(falhas, format('(e) VERMELHO PELO MOTIVO ERRADO: %s', r ->> 'motivo'));
    end if;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(e) estourou: %s', sqlerrm)); end if;
  end;

  ---------------------------------- f. VENCIDO --------------------------------
  begin
    casos := casos + 1;
    set local role service_role;
    cod := public.whatsapp_numero_pedir_codigo(ana, tel);
    reset role;
    update public.whatsapp_numeros_usuario set codigo_expira_em = now() - interval '1 second' where user_id = ana;
    perform set_config('request.jwt.claim.sub', ana::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', ana, 'role', 'authenticated')::text, true);
    set local role authenticated;
    r := public.whatsapp_numero_confirmar(cod);
    reset role;
    if coalesce((r ->> 'ok')::boolean, false) then
      falhas := array_append(falhas, '(f) código VENCIDO confirmou');
    elsif r ->> 'motivo' not like 'O código venceu%' then
      falhas := array_append(falhas, format('(f) VERMELHO PELO MOTIVO ERRADO: %s', r ->> 'motivo'));
    end if;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(f) estourou: %s', sqlerrm)); end if;
  end;

  ------------------------------ g. TELEFONE DE OUTRA PESSOA -------------------
  begin
    casos := casos + 1;
    set local role service_role;
    cod := public.whatsapp_numero_pedir_codigo(ana, tel);
    reset role;
    perform set_config('request.jwt.claim.sub', ana::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', ana, 'role', 'authenticated')::text, true);
    set local role authenticated;
    r := public.whatsapp_numero_confirmar(cod);
    reset role;
    erro := null;
    begin
      set local role service_role;
      cod2 := public.whatsapp_numero_pedir_codigo(bia, tel);
      reset role;
    exception when others then reset role; erro := sqlerrm;
    end;
    if erro is null then
      falhas := array_append(falhas, '(g) a BIA recebeu código para o celular já confirmado pela ANA');
    elsif erro not like 'A4P-WAN-OCUPADO%' then
      falhas := array_append(falhas, format('(g) VERMELHO PELO MOTIVO ERRADO: %s', erro));
    end if;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(g) estourou: %s', sqlerrm)); end if;
  end;

  ------------------------------ h. QUEM PEDIU SAIR ----------------------------
  begin
    casos := casos + 1;
    insert into public.whatsapp_saidas (telefone, origem) values ('11999997777', 'SAIR');
    erro := null;
    begin
      set local role service_role;
      cod := public.whatsapp_numero_pedir_codigo(ana, tel);
      reset role;
    exception when others then reset role; erro := sqlerrm;
    end;
    if erro is null then
      falhas := array_append(falhas, '(h) o celular que pediu SAIR recebeu código');
    elsif erro not like 'A4P-WAN-SAIU%' then
      falhas := array_append(falhas, format('(h) VERMELHO PELO MOTIVO ERRADO: %s', erro));
    end if;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(h) estourou: %s', sqlerrm)); end if;
  end;

  ------------------------------ i. TETO POR HORA ------------------------------
  begin
    casos := casos + 1;
    set local role service_role;
    for i in 1..3 loop cod := public.whatsapp_numero_pedir_codigo(ana, tel); end loop;
    reset role;
    erro := null;
    begin
      set local role service_role;
      cod := public.whatsapp_numero_pedir_codigo(ana, tel2);
      reset role;
    exception when others then reset role; erro := sqlerrm;
    end;
    if erro is null or erro not like 'A4P-WAN-LIMITE%você%' then
      falhas := array_append(falhas, format('(i) o 4º código da mesma PESSOA na hora não foi recusado pelo teto: %s', coalesce(erro, 'aceito')));
    end if;
    -- o TELEFONE também tem teto: outra pessoa não importuna o mesmo número
    erro := null;
    begin
      set local role service_role;
      cod := public.whatsapp_numero_pedir_codigo(bia, tel);
      reset role;
    exception when others then reset role; erro := sqlerrm;
    end;
    if erro is null or erro not like 'A4P-WAN-LIMITE%celular%' then
      falhas := array_append(falhas, format('(i) o 4º código para o mesmo TELEFONE na hora não foi recusado: %s', coalesce(erro, 'aceito')));
    end if;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(i) estourou: %s', sqlerrm)); end if;
  end;

  ------------------------------ j. SEM PAPEL DE ADMINISTRAR -------------------
  begin
    casos := casos + 1;
    update public.organization_members set role = 'leitor' where user_id = bia;
    erro := null;
    begin
      set local role service_role;
      cod := public.whatsapp_numero_pedir_codigo(bia, tel2);
      reset role;
    exception when others then reset role; erro := sqlerrm;
    end;
    if erro is null then
      falhas := array_append(falhas, '(j) quem não administra nenhuma empresa recebeu código');
    elsif erro not like 'A4P-WAN-PAPEL%' then
      falhas := array_append(falhas, format('(j) VERMELHO PELO MOTIVO ERRADO: %s', erro));
    end if;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(j) estourou: %s', sqlerrm)); end if;
  end;

  ------------------------------ k. TROCAR MANTÉM O CONFIRMADO -----------------
  begin
    casos := casos + 1;
    set local role service_role;
    cod := public.whatsapp_numero_pedir_codigo(ana, tel);
    reset role;
    perform set_config('request.jwt.claim.sub', ana::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', ana, 'role', 'authenticated')::text, true);
    set local role authenticated;
    r := public.whatsapp_numero_confirmar(cod);
    reset role;
    set local role service_role;
    cod := public.whatsapp_numero_pedir_codigo(ana, tel2);
    reset role;
    if not exists (select 1 from public.whatsapp_numeros_usuario where user_id = ana and telefone = '11999997777') then
      falhas := array_append(falhas, '(k) pedir código para OUTRO número apagou o confirmado');
    end if;
    set local role authenticated;
    r := public.whatsapp_numero_confirmar(cod);
    reset role;
    if not exists (select 1 from public.whatsapp_numeros_usuario where user_id = ana and telefone = '11988886666') then
      falhas := array_append(falhas, format('(k) a troca confirmada não trocou o número: %s', r));
    end if;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(k) estourou: %s', sqlerrm)); end if;
  end;

  ----------------------------------------------------------------- veredito ---
  if array_length(falhas, 1) > 0 then
    raise exception E'CELULAR DA QUATTRO AI — % falha(s):\n  %', array_length(falhas, 1), array_to_string(falhas, E'\n  ');
  end if;
  raise notice 'whatsapp-numero: % casos (a–k) verdes', casos;
end;
$guarda$;

rollback;
