-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA: APROVAR TÍTULO PELA WHATSAPP passa pelo MESMO gatilho da Central
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/aprovacao-whatsapp.sql
--
-- O que ela prova contra o Postgres de verdade (migration 20261001140000):
--   a. caminho feliz: A lança, B (aprovador) recebe o código, o "SIM" pela
--      chave de serviço confirma e `confirmado_por` = B (o carimbo do gatilho);
--   b. o MESMO código não serve duas vezes (uso único);
--   c. telefone errado não confirma (e não revela que o código existe);
--   d. código vencido não confirma;
--   e. aprovador = quem lançou, havendo outro aprovador: a SEGREGAÇÃO do
--      gatilho `central_maquina` recusa — e o pedido fica respondido com o motivo;
--   f. `authenticated` NÃO executa a resposta (só a chave de serviço);
--   g. "NÃO" não muda o título.
--
-- ⚠️ Cada caso roda num SUBBLOCO que termina levantando uma sentinela — em
-- plpgsql isso é um savepoint desfeito. E todos os casos usam o MESMO telefone
-- de propósito: se um caso deixasse estado para o seguinte, o vazamento
-- apareceria como colisão, não passaria por acaso de ordem.
--
-- ⚠️ "Recusado" só conta se a mensagem NOMEAR o defeito auditado — vermelho
-- pelo motivo errado é pior que guarda nenhuma.
--
-- Tudo em transação que termina em ROLLBACK. Falha com EXCEÇÃO (ON_ERROR_STOP).
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

begin;

do $guarda$
declare
  ana uuid := gen_random_uuid();   -- titular, LANÇA os títulos
  bia uuid := gen_random_uuid();   -- aprovadora da mesma empresa
  o uuid; c uuid; t uuid;
  tel constant text := '+55 (11) 99999-8888';   -- o MESMO em todos os casos
  cod text;
  r jsonb;
  sit text; conf uuid; resp text; res text;
  erro text;
  sentinela constant text := 'GUARDA_DESFAZ_CASO';
  falhas text[] := '{}';
  casos int := 0;
begin
  ---------------------------------------------------------------- montagem ---
  -- Usuários pelo gatilho de signup (a empresa da ana nasce sozinha).
  insert into auth.users (id, email, raw_user_meta_data) values
    (ana, 'wa-ana@guarda.local', '{"company":"Guarda WA"}'),
    (bia, 'wa-bia@guarda.local', '{"company":"Guarda WA B"}');

  select org_id into o from public.organization_members where user_id = ana limit 1;
  if o is null then raise exception 'GUARDA INVÁLIDA: provisionamento não criou empresa'; end if;

  insert into public.organization_members (org_id, user_id, role)
  values (o, bia, 'aprovador')
  on conflict (org_id, user_id) do update set role = 'aprovador';
  insert into public.user_active_org (user_id, org_id) values (bia, o)
  on conflict (user_id) do update set org_id = excluded.org_id;
  insert into public.user_active_org (user_id, org_id) values (ana, o)
  on conflict (user_id) do update set org_id = excluded.org_id;

  select id into c from public.financial_accounts where org_id = o limit 1;

  ------------------------------------------------- a. CAMINHO FELIZ -----------
  begin
    casos := casos + 1;
    insert into public.movements (org_id, account_id, type, amount, description, due_date, origem, situacao, lancado_por)
    values (o, c, 'saida', 1000, 'título wa (a)', current_date, 'manual', 'previsto', ana) returning id into t;

    -- a ANA (lançadora) pede para a BIA
    perform set_config('request.jwt.claim.sub', ana::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', ana, 'role', 'authenticated')::text, true);
    set local role authenticated;
    cod := public.pedir_aprovacao_whatsapp(t, bia, tel);
    reset role;

    if cod !~ '^[A-HJ-NP-Z2-9]{6}$' then
      falhas := array_append(falhas, format('(a) código fora do alfabeto sem ambiguidade: %s', cod));
    end if;
    if exists (select 1 from public.aprovacao_whatsapp_pedidos where codigo_hash = cod or codigo_hash = upper(cod)) then
      falhas := array_append(falhas, '(a) o código foi gravado em TEXTO');
    end if;
    if exists (select 1 from public.audit_log where acao = 'aprovacao_whatsapp.pedir' and depois::text like '%' || cod || '%') then
      falhas := array_append(falhas, '(a) o código foi para a trilha de auditoria');
    end if;

    -- a resposta chega pela chave de serviço (código em minúsculas: tem de valer)
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
    set local role service_role;
    r := public.responder_aprovacao_whatsapp('whatsapp:+5511999998888', lower(cod), 'sim');
    reset role;

    select situacao, confirmado_por into sit, conf from public.movements where id = t;
    if not coalesce((r ->> 'ok')::boolean, false) then
      falhas := array_append(falhas, format('(a) o SIM legítimo foi recusado: %s', r));
    elsif sit <> 'confirmado' then
      falhas := array_append(falhas, format('(a) o título não ficou confirmado (situação %s)', sit));
    elsif conf is distinct from bia then
      falhas := array_append(falhas, format('(a) confirmado_por = %s, esperado a aprovadora (o gatilho não carimbou quem aprovou)', conf));
    end if;
    if not exists (select 1 from public.central_transicoes
                    where movement_id = t and de = 'previsto' and para = 'confirmado' and por = bia) then
      falhas := array_append(falhas, '(a) a transição não foi para a trilha da Central com a aprovadora');
    end if;
    if current_setting('request.jwt.claim.sub', true) is distinct from '' then
      falhas := array_append(falhas, '(a) a identidade do aprovador VAZOU para depois da resposta');
    end if;

    ----------------------------------------------- b. O MESMO CÓDIGO DE NOVO --
    casos := casos + 1;
    set local role service_role;
    r := public.responder_aprovacao_whatsapp(tel, cod, 'sim');
    reset role;
    if coalesce((r ->> 'ok')::boolean, false) then
      falhas := array_append(falhas, '(b) o MESMO código confirmou duas vezes (uso único quebrado)');
    elsif r ->> 'motivo' not like '%inválido ou já utilizado%' then
      falhas := array_append(falhas, format('(b) VERMELHO PELO MOTIVO ERRADO: %s', r ->> 'motivo'));
    end if;

    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(a/b) estourou: %s', sqlerrm)); end if;
  end;

  ------------------------------------------------- c. TELEFONE ERRADO ---------
  begin
    casos := casos + 1;
    insert into public.movements (org_id, account_id, type, amount, description, due_date, origem, situacao, lancado_por)
    values (o, c, 'saida', 1000, 'título wa (c)', current_date, 'manual', 'previsto', ana) returning id into t;
    perform set_config('request.jwt.claim.sub', ana::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', ana, 'role', 'authenticated')::text, true);
    set local role authenticated;
    cod := public.pedir_aprovacao_whatsapp(t, bia, tel);
    reset role;

    set local role service_role;
    r := public.responder_aprovacao_whatsapp('5521988887777', cod, 'sim');
    reset role;
    select situacao into sit from public.movements where id = t;
    select respondido_em::text into res from public.aprovacao_whatsapp_pedidos where movement_id = t;
    if coalesce((r ->> 'ok')::boolean, false) or sit = 'confirmado' then
      falhas := array_append(falhas, '(c) telefone ERRADO confirmou o título');
    elsif r ->> 'motivo' not like '%inválido ou já utilizado%' then
      falhas := array_append(falhas, format('(c) VERMELHO PELO MOTIVO ERRADO: %s', r ->> 'motivo'));
    elsif r ->> 'motivo' like '%outro telefone%' or r ->> 'motivo' like '%existe%' then
      falhas := array_append(falhas, '(c) a recusa REVELA que o código existe para outro telefone');
    elsif res is not null then
      falhas := array_append(falhas, '(c) o telefone errado CONSUMIU o pedido do aprovador de verdade');
    end if;

    -- c2. o telefone CERTO com um código ERRADO também não confirma: é o par
    -- (código, telefone) que identifica o pedido, nunca o telefone sozinho.
    set local role service_role;
    r := public.responder_aprovacao_whatsapp(tel, case when cod = 'ZZZZZZ' then 'YYYYYY' else 'ZZZZZZ' end, 'sim');
    reset role;
    select situacao into sit from public.movements where id = t;
    if coalesce((r ->> 'ok')::boolean, false) or sit = 'confirmado' then
      falhas := array_append(falhas, '(c2) código ERRADO no telefone certo confirmou o título (o hash não foi conferido)');
    elsif r ->> 'motivo' not like '%inválido ou já utilizado%' then
      falhas := array_append(falhas, format('(c2) VERMELHO PELO MOTIVO ERRADO: %s', r ->> 'motivo'));
    end if;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(c) estourou: %s', sqlerrm)); end if;
  end;

  ------------------------------------------------- d. CÓDIGO VENCIDO ----------
  begin
    casos := casos + 1;
    insert into public.movements (org_id, account_id, type, amount, description, due_date, origem, situacao, lancado_por)
    values (o, c, 'saida', 1000, 'título wa (d)', current_date, 'manual', 'previsto', ana) returning id into t;
    perform set_config('request.jwt.claim.sub', ana::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', ana, 'role', 'authenticated')::text, true);
    set local role authenticated;
    cod := public.pedir_aprovacao_whatsapp(t, bia, tel);
    reset role;
    update public.aprovacao_whatsapp_pedidos set expira_em = now() - interval '1 minute' where movement_id = t;

    set local role service_role;
    r := public.responder_aprovacao_whatsapp(tel, cod, 'sim');
    reset role;
    select situacao into sit from public.movements where id = t;
    if coalesce((r ->> 'ok')::boolean, false) or sit = 'confirmado' then
      falhas := array_append(falhas, '(d) código VENCIDO confirmou o título');
    elsif r ->> 'motivo' not like '%expirado%' then
      falhas := array_append(falhas, format('(d) VERMELHO PELO MOTIVO ERRADO: %s', r ->> 'motivo'));
    end if;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(d) estourou: %s', sqlerrm)); end if;
  end;

  ---------------------------- e. APROVADOR = QUEM LANÇOU (havendo outro) ------
  begin
    casos := casos + 1;
    insert into public.movements (org_id, account_id, type, amount, description, due_date, origem, situacao, lancado_por)
    values (o, c, 'saida', 1000, 'título wa (e)', current_date, 'manual', 'previsto', ana) returning id into t;
    -- a ANA pede para ELA MESMA (é titular, tem `aprovar`); a BIA existe.
    perform set_config('request.jwt.claim.sub', ana::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', ana, 'role', 'authenticated')::text, true);
    set local role authenticated;
    cod := public.pedir_aprovacao_whatsapp(t, ana, tel);
    reset role;

    set local role service_role;
    r := public.responder_aprovacao_whatsapp(tel, cod, 'sim');
    reset role;
    select situacao into sit from public.movements where id = t;
    select respondido_em::text, resultado into resp, res from public.aprovacao_whatsapp_pedidos where movement_id = t;
    if coalesce((r ->> 'ok')::boolean, false) or sit = 'confirmado' then
      falhas := array_append(falhas, '(e) quem LANÇOU confirmou o próprio título pelo WhatsApp (segregação contornada)');
    elsif r ->> 'motivo' not like 'A4P-CENTRAL-SEGREGACAO%' then
      falhas := array_append(falhas, format('(e) VERMELHO PELO MOTIVO ERRADO (esperado A4P-CENTRAL-SEGREGACAO): %s', r ->> 'motivo'));
    elsif resp is null or res not like 'A4P-CENTRAL-SEGREGACAO%' then
      falhas := array_append(falhas, format('(e) o pedido recusado não ficou respondido com o motivo (resultado: %s)', res));
    end if;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(e) estourou: %s', sqlerrm)); end if;
  end;

  ------------------------------------- f. AUTHENTICATED NÃO RESPONDE ----------
  begin
    casos := casos + 1;
    insert into public.movements (org_id, account_id, type, amount, description, due_date, origem, situacao, lancado_por)
    values (o, c, 'saida', 1000, 'título wa (f)', current_date, 'manual', 'previsto', ana) returning id into t;
    perform set_config('request.jwt.claim.sub', ana::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', ana, 'role', 'authenticated')::text, true);
    set local role authenticated;
    cod := public.pedir_aprovacao_whatsapp(t, bia, tel);
    reset role;

    -- a BIA, logada, tenta responder em nome próprio — mesmo sabendo o código
    erro := null;
    perform set_config('request.jwt.claim.sub', bia::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', bia, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      r := public.responder_aprovacao_whatsapp(tel, cod, 'sim');
    exception when others then erro := sqlerrm;
    end;
    reset role;
    select situacao into sit from public.movements where id = t;
    if sit = 'confirmado' then
      falhas := array_append(falhas, '(f) authenticated EXECUTOU a resposta e confirmou');
    elsif erro is null or erro not like '%permission denied%responder_aprovacao_whatsapp%' then
      falhas := array_append(falhas, format('(f) VERMELHO PELO MOTIVO ERRADO (esperado permission denied): %s', coalesce(erro, '<sem erro>')));
    end if;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(f) estourou: %s', sqlerrm)); end if;
  end;

  ------------------------------------------------- g. "NÃO" NÃO MEXE ----------
  begin
    casos := casos + 1;
    insert into public.movements (org_id, account_id, type, amount, description, due_date, origem, situacao, lancado_por)
    values (o, c, 'saida', 1000, 'título wa (g)', current_date, 'manual', 'previsto', ana) returning id into t;
    perform set_config('request.jwt.claim.sub', ana::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', ana, 'role', 'authenticated')::text, true);
    set local role authenticated;
    cod := public.pedir_aprovacao_whatsapp(t, bia, tel);
    reset role;

    set local role service_role;
    r := public.responder_aprovacao_whatsapp(tel, cod, 'nao');
    reset role;
    select situacao, confirmado_por into sit, conf from public.movements where id = t;
    select resposta into resp from public.aprovacao_whatsapp_pedidos where movement_id = t;
    if sit <> 'previsto' or conf is not null then
      falhas := array_append(falhas, format('(g) o NÃO mudou o título (situação %s)', sit));
    elsif not coalesce((r ->> 'ok')::boolean, false) or r ->> 'decisao' <> 'nao' or resp is distinct from 'nao' then
      falhas := array_append(falhas, format('(g) o NÃO não foi registrado como recusa do aprovador: %s', r));
    end if;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(g) estourou: %s', sqlerrm)); end if;
  end;

  ----------------------------------------------------------------- veredito ---
  if array_length(falhas, 1) > 0 then
    raise exception E'APROVAÇÃO POR WHATSAPP — % falha(s):\n  %', array_length(falhas, 1), array_to_string(falhas, E'\n  ');
  end if;
  raise notice 'aprovacao-whatsapp: % casos (a–g) verdes', casos;
end;
$guarda$;

rollback;
