-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA DO DISPARO DOS FLUXOS — quem decide, o que se lê, a trava
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/automacao-fluxos.sql
--
-- A guarda pura (`npm run fluxos`, bloco "disparo") prova a DECISÃO: o que
-- vence agora, a chave por destino, salvo por quem não administra não envia.
-- Esta prova o que só existe no banco:
--
--   1. `automacao_fluxos_ligados` diz QUEM gravou por último: o titular grava
--      → administra; o lançador regrava → deixa de administrar (o executor
--      para de mandar até alguém que responde pela empresa salvar de novo);
--   2. as duas funções são SÓ da chave de serviço (a sessão leva "permission
--      denied", lendo a mensagem);
--   3. `automacao_envios` aceita o tipo `fluxo`, o índice único recusa a
--      mesma chave duas vezes, e tipo inventado continua recusado;
--   4. as vendas da maquininha são do dia de BRASÍLIA (22h30 conta no dia;
--      23h30 da véspera não), com forma, parcelas e bandeira do evento, e a
--      outra empresa não enxerga nada.
--
-- ⚠️ Os usuários entram por `auth.users` (o gatilho de signup provisiona) — o
-- arreio é o de `automacoes.sql`, copiado. Tudo termina em ROLLBACK.
-- ⚠️ NADA de `raise` dentro de bloco protegido: marca-se e julga-se FORA.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

begin;

do $guarda$
declare
  ua uuid := gen_random_uuid();   -- titular da empresa A
  un uuid := gen_random_uuid();   -- lançador da empresa A
  ub uuid := gen_random_uuid();   -- titular da empresa B
  oa uuid; ob uuid; vin uuid;
  n bigint; msg text; v jsonb; adm boolean;
  fluxos jsonb := '[{"id":"f1","nome":"Guarda","ativo":true,"nos":[],"ligacoes":[]}]';
begin
  ---------------------------------------------------------------- montagem ---
  insert into auth.users (id, email, aud, role) values
    (ua, 'flx-a@guarda.local', 'authenticated', 'authenticated'),
    (un, 'flx-lancador@guarda.local', 'authenticated', 'authenticated'),
    (ub, 'flx-b@guarda.local', 'authenticated', 'authenticated');
  select om.org_id into oa from public.organization_members om where om.user_id = ua limit 1;
  select om.org_id into ob from public.organization_members om where om.user_id = ub limit 1;
  if oa is null or ob is null or oa = ob then
    raise exception 'GUARDA INVÁLIDA: o provisionamento não criou duas empresas. Nada abaixo prova coisa alguma.';
  end if;
  insert into public.organization_members (org_id, user_id, role) values (oa, un, 'lancador')
    on conflict (org_id, user_id) do update set role = 'lancador';
  insert into public.user_active_org (user_id, org_id) values (un, oa)
    on conflict (user_id) do update set org_id = excluded.org_id;

  ------------------------------------ 1. O TITULAR grava → administra ---
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ua::text, true);
  set local role authenticated;
  perform public.org_state_set('a4p_automacao_fluxos', fluxos);
  reset role;
  set local role service_role;
  select f.salvo_por_administra into adm from public.automacao_fluxos_ligados() f where f.org_id = oa;
  reset role;
  if adm is distinct from true then
    raise exception 'CASO 1 FALHOU: fluxo salvo pelo TITULAR não conta como de quem administra (veio %). O executor nunca mandaria nada.', adm;
  end if;

  ------------------------------------ 1b. O LANÇADOR regrava → não administra ---
  perform set_config('request.jwt.claims', json_build_object('sub', un, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', un::text, true);
  set local role authenticated;
  begin
    perform public.org_state_set('a4p_automacao_fluxos', fluxos);
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  if msg is not null then
    raise exception 'GUARDA INVÁLIDA (caso 1b): o lançador não conseguiu gravar o estado da empresa (%), então o caso não prova nada.', msg;
  end if;
  set local role service_role;
  select f.salvo_por_administra into adm from public.automacao_fluxos_ligados() f where f.org_id = oa;
  select count(*) into n from public.automacao_fluxos_ligados() f where f.org_id = ob;
  reset role;
  if adm is distinct from false then
    raise exception 'CASO 1b FALHOU: fluxo regravado pelo LANÇADOR ainda conta como de quem administra — ele mandaria os números da empresa para qualquer telefone.';
  end if;
  if n <> 0 then raise exception 'CASO 1b FALHOU: empresa sem fluxo aparece na lista (% linha(s)).', n; end if;

  ------------------------------------------- 2. SÓ a chave de serviço ---
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ua::text, true);
  set local role authenticated;
  begin
    perform * from public.automacao_fluxos_ligados();
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  if msg is null then raise exception 'CASO 2 FALHOU: a sessão do titular leu os fluxos de TODAS as empresas.'; end if;
  if msg not like '%permission denied%automacao_fluxos_ligados%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso 2): "%"', msg;
  end if;
  set local role authenticated;
  begin
    perform public.automacao_vendas_maquininha(oa, current_date);
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  if msg is null then raise exception 'CASO 2 FALHOU: a sessão leu as vendas da maquininha pela porta do executor.'; end if;
  if msg not like '%permission denied%automacao_vendas_maquininha%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso 2b): "%"', msg;
  end if;

  ------------------------------------------------- 3. A trava aceita o fluxo ---
  insert into public.automacao_envios (org_id, tipo, chave, canal, status)
  values (oa, 'fluxo', 'fluxo:f1:2026-10-19:aaaa', 'whatsapp', 'pendente');
  begin
    insert into public.automacao_envios (org_id, tipo, chave, canal, status)
    values (oa, 'fluxo', 'fluxo:f1:2026-10-19:aaaa', 'whatsapp', 'pendente');
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  if msg is null then raise exception 'CASO 3 FALHOU: o mesmo disparo entrou duas vezes — a janela seguinte do cron mandaria de novo.'; end if;
  if msg not like '%automacao_envios_unico%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso 3): esperado o índice automacao_envios_unico, veio "%"', msg;
  end if;
  begin
    insert into public.automacao_envios (org_id, tipo, chave, canal, status)
    values (oa, 'inventado', 'x', 'whatsapp', 'pendente');
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  if msg is null then raise exception 'CASO 3 FALHOU: tipo inventado entrou no registro de envios.'; end if;
  if msg not like '%automacao_envios_tipo_check%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso 3b): "%"', msg;
  end if;

  ------------------------------------- 4. A maquininha no dia de Brasília ---
  insert into public.pinbank_vinculos (org_id, estabelecimento_id, ativo, nome, responsavel_id, ativado_em)
  values (oa, 987654321, true, 'Guarda', ua, now()) returning id into vin;
  -- 2026-10-20T01:30Z = 19/10 22:30 em Brasília: CONTA no dia 19.
  -- 2026-10-19T02:30Z = 18/10 23:30 em Brasília: NÃO conta.
  insert into public.pinbank_transacoes (org_id, nsu, vinculo_id, status, valor, valor_original, ocorrido_em) values
    (oa, 900001, vin, 'Aprovada', 300, 300, '2026-10-20T01:30:00Z'),
    (oa, 900002, vin, 'Aprovada', 1000, 1000, '2026-10-19T02:30:00Z');
  insert into public.pinbank_eventos (event_id, event_type, ocorrido_em, org_id, vinculo_id, nsu, payload) values
    (gen_random_uuid(), 'Compra.Credito.Aprovada', '2026-10-20T01:30:00Z', oa, vin, 900001,
     '{"formaPagamento":"PARCELADO_LOJA","numeroParcelas":3,"cartao":{"bandeira":"Mastercard"}}');

  set local role service_role;
  v := public.automacao_vendas_maquininha(oa, date '2026-10-19');
  reset role;
  if (v ->> 'temMaquininha')::boolean is distinct from true then
    raise exception 'CASO 4 FALHOU: com vínculo ativo, temMaquininha veio %', v ->> 'temMaquininha';
  end if;
  if jsonb_array_length(v -> 'vendas') <> 1 or (v -> 'vendas' -> 0 ->> 'nsu')::bigint <> 900001 then
    raise exception 'CASO 4 FALHOU: o dia 19 de Brasília devia ter SÓ a venda das 22h30 (900001); veio %', v -> 'vendas';
  end if;
  if v -> 'vendas' -> 0 ->> 'formaPagamento' <> 'PARCELADO_LOJA'
     or v -> 'vendas' -> 0 ->> 'numeroParcelas' <> '3'
     or v -> 'vendas' -> 0 ->> 'bandeira' <> 'Mastercard' then
    raise exception 'CASO 4 FALHOU: forma, parcelas e bandeira não vieram do evento: %', v -> 'vendas' -> 0;
  end if;
  if v -> 'vendas' -> 0 -> 'liquido' <> 'null'::jsonb then
    raise exception 'CASO 4 FALHOU: venda sem documento devia ter líquido NULO (desconhecido), veio %', v -> 'vendas' -> 0 -> 'liquido';
  end if;

  set local role service_role;
  v := public.automacao_vendas_maquininha(ob, date '2026-10-19');
  reset role;
  if (v ->> 'temMaquininha')::boolean or jsonb_array_length(v -> 'vendas') <> 0 then
    raise exception 'CASO 4 FALHOU: a empresa B enxerga a maquininha da A: %', v;
  end if;

  raise notice 'Guarda do disparo dos fluxos: 4 casos, todos verdes.';
end $guarda$;

rollback;
