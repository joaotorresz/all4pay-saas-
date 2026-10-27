-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA DA COBRANÇA PELA CONTA BANCÁRIA DA EMPRESA — a fechadura no banco
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/cobranca-banco.sql
--
-- Prova a migration 20261028120000:
--
--   1. só quem ADMINISTRA conecta a conta que recebe; o texto puro não entra
--      no lugar do cifrado; NINGUÉM do cliente lê o segredo; o servidor lê; e
--      conectar de novo desliga a anterior e apaga o segredo dela;
--   2. sem conta conectada, nada se reserva;
--   3. a reserva lê valor, vencimento e pagador do TÍTULO, o nosso número sai
--      do id, e o leitor não reserva;
--   4. só título A RECEBER, vivo, em aberto, que não seja transferência;
--   5. o segundo clique: reservada recusa, emitida devolve a MESMA;
--   6. só o SERVIDOR registra, e só pelas transições da máquina: `incerta`
--      nunca vira `falhou`, o id do banco não troca, emitida tem dado;
--   7. `processando` e `incerta` devolvem a MESMA cobrança para conferir —
--      nunca uma segunda — e a consulta que falha não rebaixa quem tem o id;
--   8. o título mudou depois de emitida → `a_cancelar`, e nova emissão recusada;
--   9. a cobrança viva da PINBANK do mesmo título também segura;
--  10. a empresa B não vê nem reserva nada da A; ninguém escreve direto;
--      desconectar apaga o segredo e o servidor deixa de ler a credencial.
--
-- E os DEFEITOS PLANTADOS no fim, no arreio de `pinbank-cobranca.sql`:
-- cada um reescreve uma função num savepoint e exige que a prova REPROVE pelo
-- motivo certo. Planta que não acha o trecho reprova. Tudo termina em ROLLBACK.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

begin;

------------------------------------------------------------------ montagem ---
do $montagem$
declare
  ua uuid := gen_random_uuid();   -- titular da empresa A
  ul uuid := gen_random_uuid();   -- leitor da empresa A
  un uuid := gen_random_uuid();   -- lançador da empresa A
  ub uuid := gen_random_uuid();   -- titular da empresa B
  oa uuid; ob uuid; ca uuid; pa uuid;
begin
  insert into auth.users (id, email) values
    (ua, 'cbb-a@guarda.local'), (ul, 'cbb-leitor@guarda.local'),
    (un, 'cbb-lancador@guarda.local'), (ub, 'cbb-b@guarda.local');
  select om.org_id into oa from public.organization_members om where om.user_id = ua limit 1;
  select om.org_id into ob from public.organization_members om where om.user_id = ub limit 1;
  if oa is null or ob is null or oa = ob then
    raise exception 'GUARDA INVÁLIDA: o provisionamento não criou duas empresas.';
  end if;
  insert into public.organization_members (org_id, user_id, role) values (oa, ul, 'leitor'), (oa, un, 'lancador')
    on conflict (org_id, user_id) do update set role = excluded.role;
  insert into public.user_active_org (user_id, org_id) values (ul, oa), (un, oa)
    on conflict (user_id) do update set org_id = excluded.org_id;

  select a.id into ca from public.financial_accounts a
   where a.org_id = oa and a.excluido_em is null and a.ativo order by a.created_at limit 1;
  if ca is null then
    raise exception 'GUARDA INVÁLIDA: a empresa A nasceu sem conta ativa (o seed mudou?).';
  end if;
  insert into public.parties (org_id, type, name, doc, is_customer, email, zip, street, number, district, city, state)
  values (oa, 'pj', 'Cliente da cobrança', '11.222.333/0001-81', true, 'cliente@guarda.local',
          '01310100', 'Avenida Paulista', '1000', 'Bela Vista', 'São Paulo', 'SP')
  returning id into pa;

  perform set_config('guarda.ua', ua::text, true);
  perform set_config('guarda.ul', ul::text, true);
  perform set_config('guarda.un', un::text, true);
  perform set_config('guarda.ub', ub::text, true);
  perform set_config('guarda.oa', oa::text, true);
  perform set_config('guarda.ob', ob::text, true);
  perform set_config('guarda.ca', ca::text, true);
  perform set_config('guarda.pa', pa::text, true);
  perform set_config('guarda.codigo', (select coalesce(max(codigo_cliente), 0) + 9000 from public.pinbank_vinculos)::text, true);
end
$montagem$;

create or replace function pg_temp.como(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
end $$;

create or replace function pg_temp.erro_como(p_user uuid, p_sql text) returns text language plpgsql as $$
declare msg text;
begin
  perform pg_temp.como(p_user);
  begin
    set local role authenticated;
    execute p_sql;
    reset role;
    return null;
  exception when others then
    msg := SQLERRM;
  end;
  reset role;
  return msg;
end $$;

create or replace function pg_temp.erro_servidor(p_sql text) returns text language plpgsql as $$
declare msg text;
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    set local role service_role;
    execute p_sql;
    reset role;
    return null;
  exception when others then
    msg := SQLERRM;
  end;
  reset role;
  return msg;
end $$;

-- Um texto no FORMATO do cofre (v1.<iv>.<tag>.<cifra>); o conteúdo não importa ao banco.
create or replace function pg_temp.cifrado() returns text language sql as $$
  select 'v1.' || encode(decode(left(md5(random()::text), 24), 'hex'), 'base64')
         || '.' || encode(decode(md5(random()::text), 'hex'), 'base64')
         || '.' || encode(decode(md5(random()::text) || md5(random()::text), 'hex'), 'base64')
$$;

create or replace function pg_temp.conectar(p_user uuid) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  perform pg_temp.como(p_user);
  set local role authenticated;
  perform public.cobranca_banco_conectar(v, 'inter', 'sandbox', 'client-guarda', '12345-6', current_date + 300, pg_temp.cifrado());
  reset role;
  return v;
end $$;

create or replace function pg_temp.reservar(p_user uuid, p_mov uuid, p_tipo text default 'boleto_pix') returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.como(p_user);
  set local role authenticated;
  r := public.cobranca_banco_reservar(p_mov, p_tipo);
  reset role;
  return r;
end $$;

create or replace function pg_temp.registrar(p_id uuid, p_res jsonb) returns text language plpgsql as $$
declare s text;
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role service_role;
  s := public.cobranca_banco_registrar(p_id, p_res);
  reset role;
  return s;
end $$;

create or replace function pg_temp.titulo(p_tipo text default 'entrada', p_categoria text default 'Vendas') returns uuid language plpgsql as $$
declare t uuid;
begin
  insert into public.movements (org_id, account_id, type, amount, description, due_date, origem, situacao,
                                lancado_por, party_id, category)
  values (current_setting('guarda.oa')::uuid, current_setting('guarda.ca')::uuid, p_tipo::movement_type, 250.40,
          'Mensalidade da guarda', current_date + 10, 'manual', 'previsto', current_setting('guarda.ua')::uuid,
          current_setting('guarda.pa')::uuid, p_categoria)
  returning id into t;
  return t;
end $$;

grant execute on all functions in schema pg_temp to authenticated, service_role;

-- ═══ A PROVA ═══
create or replace function pg_temp.prova() returns void language plpgsql as $$
declare
  ua uuid := current_setting('guarda.ua')::uuid;
  ul uuid := current_setting('guarda.ul')::uuid;
  un uuid := current_setting('guarda.un')::uuid;
  ub uuid := current_setting('guarda.ub')::uuid;
  oa uuid := current_setting('guarda.oa')::uuid;
  cx uuid; cx2 uuid; t uuid; t2 uuid; r jsonb; msg text; c record; n int; s text; vpb uuid;
begin
  -- 2. sem conta conectada, nada se reserva
  t := pg_temp.titulo();
  msg := pg_temp.erro_como(ua, format('select public.cobranca_banco_reservar(%L, ''boleto_pix'')', t));
  if msg is null or msg not like '%nenhuma conta bancária conectada%' then
    raise exception 'CASO 2 FALHOU: reservou sem conta conectada (veio: %).', coalesce(msg, 'aceito');
  end if;

  -- 1. conectar
  msg := pg_temp.erro_como(un, format(
    'select public.cobranca_banco_conectar(gen_random_uuid(), ''inter'', ''sandbox'', ''x'', null, null, %L)', pg_temp.cifrado()));
  if msg is null or msg not like '%só quem administra%' then
    raise exception 'CASO 1 FALHOU: o LANÇADOR conectou a conta que recebe (veio: %).', coalesce(msg, 'aceito');
  end if;
  msg := pg_temp.erro_como(ua,
    'select public.cobranca_banco_conectar(gen_random_uuid(), ''inter'', ''sandbox'', ''x'', null, null, ''-----BEGIN PRIVATE KEY-----'')');
  if msg is null or msg not like '%cobranca_banco_segredos_cifrado_check%' then
    raise exception 'CASO 1 FALHOU: o segredo em TEXTO PURO foi guardado (veio: %).', coalesce(msg, 'aceito');
  end if;
  cx := pg_temp.conectar(ua);
  msg := pg_temp.erro_como(ua, 'select count(*) from public.cobranca_banco_segredos');
  if msg is null or msg not like '%permission denied%' then
    raise exception 'CASO 1 FALHOU: a SESSÃO DO CLIENTE leu o segredo (veio: %).', coalesce(msg, 'aceito');
  end if;
  msg := pg_temp.erro_como(ua, format('select public.cobranca_banco_credencial(%L)', cx));
  if msg is null or msg not like '%permission denied%' then
    raise exception 'CASO 1 FALHOU: a SESSÃO DO CLIENTE abriu a credencial (veio: %).', coalesce(msg, 'aceito');
  end if;
  msg := pg_temp.erro_servidor(format('select public.cobranca_banco_credencial(%L)', cx));
  if msg is not null then
    raise exception 'CASO 1 FALHOU: o servidor não leu a credencial (veio: %).', msg;
  end if;
  if (select conta_corrente from public.cobranca_banco_conexoes where id = cx) <> '123456' then
    raise exception 'CASO 1 FALHOU: a conta corrente não foi guardada só com os dígitos.';
  end if;
  cx2 := pg_temp.conectar(ua);
  if (select desligada_em from public.cobranca_banco_conexoes where id = cx) is null
     or exists (select 1 from public.cobranca_banco_segredos where conexao_id = cx)
     or not exists (select 1 from public.cobranca_banco_segredos where conexao_id = cx2) then
    raise exception 'CASO 1 FALHOU: conectar de novo não desligou a anterior nem apagou o segredo dela.';
  end if;
  cx := cx2;

  -- 3. a reserva lê do TÍTULO
  msg := pg_temp.erro_como(ul, format('select public.cobranca_banco_reservar(%L, ''boleto_pix'')', t));
  if msg is null or msg not like '%não pode gerar cobrança%' then
    raise exception 'CASO 3 FALHOU: o LEITOR reservou uma cobrança (veio: %).', coalesce(msg, 'aceito');
  end if;
  r := pg_temp.reservar(un, t);
  if (r ->> 'existente')::boolean or (r ->> 'valor')::numeric <> 250.40
     or (r ->> 'vencimento')::date <> current_date + 10
     or (r ->> 'conexaoId')::uuid <> cx
     or (r -> 'devedor' ->> 'documento') <> '11222333000181'
     or (r ->> 'seuNumero') <> left(replace(r ->> 'id', '-', ''), 15) then
    raise exception 'CASO 3 FALHOU: a reserva não saiu do título e da conexão: %', r;
  end if;

  -- 5. o segundo clique
  msg := pg_temp.erro_como(un, format('select public.cobranca_banco_reservar(%L, ''pix'')', t));
  if msg is null or msg not like '%já está sendo gerada%' then
    raise exception 'CASO 5 FALHOU: a segunda reserva do MESMO título passou (veio: %).', coalesce(msg, 'aceito');
  end if;

  -- 6. só o servidor registra, pelas transições da máquina
  msg := pg_temp.erro_como(ua, format(
    'select public.cobranca_banco_registrar(%L, ''{"situacao":"emitida","pixCopiaECola":"000201falso"}''::jsonb)', r ->> 'id'));
  if msg is null or msg not like '%permission denied%' then
    raise exception 'CASO 6 FALHOU: a SESSÃO DO CLIENTE gravou o resultado da cobrança (veio: %).', coalesce(msg, 'aceito');
  end if;
  msg := pg_temp.erro_servidor(format('select public.cobranca_banco_registrar(%L, ''{"situacao":"processando"}''::jsonb)', r ->> 'id'));
  if msg is null or msg not like '%cobranca_banco_processando_tem_id%' then
    raise exception 'CASO 6 FALHOU: "processando" sem o id do banco foi aceito (veio: %).', coalesce(msg, 'aceito');
  end if;
  s := pg_temp.registrar((r ->> 'id')::uuid, '{"situacao":"processando","idProvedor":"inter-1"}'::jsonb);

  -- 7. processando devolve a MESMA para conferir
  begin
    r := pg_temp.reservar(un, t);
  exception when others then
    reset role;
    raise exception 'CASO 7 FALHOU: com a cobrança PROCESSANDO, a reserva recusou em vez de devolver a mesma (veio: %).', SQLERRM;
  end;
  if not coalesce((r ->> 'pendente')::boolean, false) or r ->> 'idProvedor' <> 'inter-1' or (r ->> 'conexaoId')::uuid <> cx then
    raise exception 'CASO 7 FALHOU: com a cobrança PROCESSANDO, a reserva não devolveu a mesma para conferir: %', r;
  end if;
  s := pg_temp.registrar((r ->> 'id')::uuid, '{"situacao":"incerta","motivo":"a consulta não respondeu"}'::jsonb);
  if s <> 'processando' then
    raise exception 'CASO 7 FALHOU: a consulta que falhou REBAIXOU a cobrança processando para %.', s;
  end if;
  msg := pg_temp.erro_servidor(format('select public.cobranca_banco_registrar(%L, ''{"situacao":"emitida","idProvedor":"outro","linhaDigitavel":"%s"}''::jsonb)',
    r ->> 'id', repeat('1', 47)));
  if msg is null or msg not like '%outro id%' then
    raise exception 'CASO 6 FALHOU: o id do banco foi TROCADO (veio: %).', coalesce(msg, 'aceito');
  end if;
  msg := pg_temp.erro_servidor(format('select public.cobranca_banco_registrar(%L, ''{"situacao":"emitida"}''::jsonb)', r ->> 'id'));
  if msg is null or msg not like '%cobranca_banco_emitida_tem_dado%' then
    raise exception 'CASO 6 FALHOU: "emitida" sem linha nem Pix aceita (veio: %).', coalesce(msg, 'aceito');
  end if;
  s := pg_temp.registrar((r ->> 'id')::uuid, format('{"situacao":"emitida","idProvedor":"inter-1","linhaDigitavel":"%s","pixCopiaECola":"00020126br.gov.bcb.pix"}',
    repeat('1', 47))::jsonb);
  select * into c from public.cobrancas_banco where id = (r ->> 'id')::uuid;
  if c.situacao <> 'emitida' or c.emitida_em is null or c.linha_digitavel is null then
    raise exception 'CASO 6 FALHOU: o registro não gravou a emissão: %', row_to_json(c);
  end if;
  msg := pg_temp.erro_servidor(format('select public.cobranca_banco_registrar(%L, ''{"situacao":"falhou"}''::jsonb)', c.id));
  if msg is null or msg not like '%não passa a "falhou"%' then
    raise exception 'CASO 6 FALHOU: a cobrança emitida virou "falhou" e liberaria outra (veio: %).', coalesce(msg, 'aceito');
  end if;
  -- emitida: o segundo clique devolve a MESMA
  r := pg_temp.reservar(un, t);
  if not (r ->> 'existente')::boolean or (r ->> 'id')::uuid <> c.id then
    raise exception 'CASO 5 FALHOU: com a cobrança emitida, o segundo clique não devolveu a mesma: %', r;
  end if;

  -- 7. incerta segura e nunca vira falhou
  t2 := pg_temp.titulo();
  r := pg_temp.reservar(un, t2);
  s := pg_temp.registrar((r ->> 'id')::uuid, '{"situacao":"incerta","motivo":"a resposta não chegou"}'::jsonb);
  r := pg_temp.reservar(un, t2);
  if not coalesce((r ->> 'pendente')::boolean, false) or r ->> 'situacao' <> 'incerta' then
    raise exception 'CASO 7 FALHOU: com a cobrança INCERTA, a reserva não devolveu a mesma para procurar: %', r;
  end if;
  msg := pg_temp.erro_servidor(format('select public.cobranca_banco_registrar(%L, ''{"situacao":"falhou"}''::jsonb)', r ->> 'id'));
  if msg is null or msg not like '%não passa a "falhou"%' then
    raise exception 'CASO 7 FALHOU: a cobrança INCERTA virou "falhou" e liberaria a segunda (veio: %).', coalesce(msg, 'aceito');
  end if;

  -- 8. o título mudou → a_cancelar
  perform pg_temp.como(ua);
  update public.movements set amount = 300 where id = t;
  if (select situacao from public.cobrancas_banco where id = c.id) <> 'a_cancelar' then
    raise exception 'CASO 8 FALHOU: o título mudou de valor e a cobrança emitida não foi para a_cancelar.';
  end if;
  msg := pg_temp.erro_como(un, format('select public.cobranca_banco_reservar(%L, ''boleto_pix'')', t));
  if msg is null or msg not like '%precisa ser cancelada no banco%' then
    raise exception 'CASO 8 FALHOU: nova emissão com a antiga ainda pagável (veio: %).', coalesce(msg, 'aceito');
  end if;

  -- 4. só título a receber, vivo, em aberto, sem transferência
  t2 := pg_temp.titulo('saida');
  msg := pg_temp.erro_como(un, format('select public.cobranca_banco_reservar(%L, ''boleto_pix'')', t2));
  if msg is null or msg not like '%A RECEBER%' then
    raise exception 'CASO 4 FALHOU: cobrou um título a PAGAR (veio: %).', coalesce(msg, 'aceito');
  end if;
  t2 := pg_temp.titulo('entrada', 'Transferência entre contas');
  msg := pg_temp.erro_como(un, format('select public.cobranca_banco_reservar(%L, ''boleto_pix'')', t2));
  if msg is null or msg not like '%transferência%' then
    raise exception 'CASO 4 FALHOU: cobrou uma transferência entre contas próprias (veio: %).', coalesce(msg, 'aceito');
  end if;
  t2 := pg_temp.titulo();
  perform pg_temp.como(ua);
  update public.movements set situacao = 'confirmado' where id = t2;
  update public.movements set situacao = 'baixado', paid_date = current_date where id = t2;
  msg := pg_temp.erro_como(un, format('select public.cobranca_banco_reservar(%L, ''boleto_pix'')', t2));
  if msg is null or msg not like '%já foi recebido%' then
    raise exception 'CASO 4 FALHOU: cobrou um título JÁ RECEBIDO (veio: %).', coalesce(msg, 'aceito');
  end if;

  -- 9. a cobrança viva da Pinbank segura o título
  t2 := pg_temp.titulo();
  insert into public.pinbank_vinculos (org_id, estabelecimento_id, codigo_cliente) values (oa, current_setting('guarda.codigo')::bigint, current_setting('guarda.codigo')::bigint) returning id into vpb;
  insert into public.pinbank_cobrancas (org_id, vinculo_id, movement_id, tipo, valor, vencimento, codigo_cliente)
  values (oa, vpb, t2, 'pix', 250.40, current_date + 10, current_setting('guarda.codigo')::bigint);
  msg := pg_temp.erro_como(un, format('select public.cobranca_banco_reservar(%L, ''boleto_pix'')', t2));
  if msg is null or msg not like '%cobrança viva pela conta Pinbank%' then
    raise exception 'CASO 9 FALHOU: duas cobranças vivas do mesmo título, uma em cada banco (veio: %).', coalesce(msg, 'aceito');
  end if;

  -- 10. a empresa B, a escrita direta e o desconectar
  perform pg_temp.como(ub);
  set local role authenticated;
  select count(*) into n from public.cobrancas_banco;
  select n + count(*) into n from public.cobranca_banco_conexoes;
  reset role;
  if n <> 0 then
    raise exception 'CASO 10 FALHOU: a empresa B leu % linha(s) da A.', n;
  end if;
  t2 := pg_temp.titulo();
  msg := pg_temp.erro_como(ub, format('select public.cobranca_banco_reservar(%L, ''boleto_pix'')', t2));
  if msg is null or msg not like '%não encontrado na empresa aberta%' then
    raise exception 'CASO 10 FALHOU: a empresa B reservou cobrança de título da A (veio: %).', coalesce(msg, 'aceito');
  end if;
  msg := pg_temp.erro_como(ua, format('update public.cobrancas_banco set pix_copia_cola = ''x'' where id = %L', c.id));
  if msg is null or msg not like '%permission denied%' then
    raise exception 'CASO 10 FALHOU: a sessão do cliente ALTEROU a cobrança direto (veio: %).', coalesce(msg, 'aceito');
  end if;
  msg := pg_temp.erro_como(ua, format('update public.cobranca_banco_conexoes set conta_corrente = ''999'' where id = %L', cx));
  if msg is null or msg not like '%permission denied%' then
    raise exception 'CASO 10 FALHOU: a sessão do cliente TROCOU a conta que recebe direto (veio: %).', coalesce(msg, 'aceito');
  end if;
  if not exists (select 1 from public.audit_log where entidade = 'cobrancas_banco' and entidade_id = c.id::text) then
    raise exception 'CASO 10 FALHOU: a cobrança não deixou trilha.';
  end if;
  if exists (select 1 from public.audit_log where depois::text like '%v1.%' and entidade like 'cobranca_banco%') then
    raise exception 'CASO 10 FALHOU: o texto cifrado do segredo foi parar na trilha.';
  end if;
  msg := pg_temp.erro_como(un, 'select public.cobranca_banco_desconectar(''inter'')');
  if msg is null or msg not like '%só quem administra%' then
    raise exception 'CASO 10 FALHOU: o LANÇADOR desconectou a conta (veio: %).', coalesce(msg, 'aceito');
  end if;
  msg := pg_temp.erro_como(ua, 'select public.cobranca_banco_desconectar(''inter'')');
  if msg is not null then
    raise exception 'CASO 10 FALHOU: o titular não desconectou (veio: %).', msg;
  end if;
  msg := pg_temp.erro_servidor(format('select public.cobranca_banco_credencial(%L)', cx));
  if msg is null or msg not like '%desconectada%' or exists (select 1 from public.cobranca_banco_segredos where conexao_id = cx) then
    raise exception 'CASO 10 FALHOU: depois de desconectar, a credencial continuou legível (veio: %).', coalesce(msg, 'aceito');
  end if;
end $$;
grant execute on all functions in schema pg_temp to authenticated, service_role;

------------------------------------------------------- os casos, em ordem ---
savepoint caso;
select pg_temp.prova();
rollback to savepoint caso;

------------------------------------------------------ DEFEITOS PLANTADOS ---
create or replace function pg_temp.plantar(p_funcao regprocedure, p_de text, p_para text) returns void language plpgsql as $$
declare def text := pg_get_functiondef(p_funcao); novo text;
begin
  novo := replace(def, p_de, p_para);
  if novo = def then
    raise exception 'PLANTA ENVELHECIDA: o trecho "%" não está mais em %', p_de, p_funcao;
  end if;
  execute novo;
end $$;
create or replace function pg_temp.reprova(p_espera text, p_defeito text) returns void language plpgsql as $$
declare msg text;
begin
  begin
    perform pg_temp.prova();
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  if msg is null then
    raise exception 'DEFEITO PLANTADO NÃO FOI PEGO: "%" — a prova passou.', p_defeito;
  end if;
  if msg not like p_espera then
    raise exception 'VERMELHO PELO MOTIVO ERRADO ("%"): esperado %, veio "%"', p_defeito, p_espera, msg;
  end if;
end $$;
create or replace function pg_temp.plantar_reservar(p_de text, p_para text) returns void language sql as $$
  select pg_temp.plantar('public.cobranca_banco_reservar(uuid,text)'::regprocedure, p_de, p_para)
$$;
create or replace function pg_temp.plantar_registrar(p_de text, p_para text) returns void language sql as $$
  select pg_temp.plantar('public.cobranca_banco_registrar(uuid,jsonb)'::regprocedure, p_de, p_para)
$$;
grant execute on all functions in schema pg_temp to authenticated, service_role;

-- d1 · o lançador conecta a conta que recebe
savepoint caso;
do $d$ begin
  perform pg_temp.plantar('public.cobranca_banco_conectar(uuid,text,text,text,text,date,text)'::regprocedure,
    'if not public.tem_permissao(''administrar'', v_org) then', 'if not public.tem_permissao(''lancar'', v_org) then');
  perform pg_temp.reprova('%CASO 1 FALHOU%LANÇADOR conectou%', 'o lançador trocando a conta que recebe');
end $d$;
rollback to savepoint caso;

-- d2 · o cliente lê o segredo
savepoint caso;
do $d$ begin
  grant select on public.cobranca_banco_segredos to authenticated;
  create policy guarda_vaza on public.cobranca_banco_segredos for select to authenticated using (true);
  perform pg_temp.reprova('%CASO 1 FALHOU%leu o segredo%', 'o segredo legível pela sessão do cliente');
end $d$;
rollback to savepoint caso;

-- d3 · reconectar sem apagar o segredo anterior
savepoint caso;
do $d$ begin
  perform pg_temp.plantar('public.cobranca_banco_conectar(uuid,text,text,text,text,date,text)'::regprocedure,
    'where s.conexao_id = c.id and c.org_id = v_org', 'where false and s.conexao_id = c.id and c.org_id = v_org');
  perform pg_temp.reprova('%CASO 1 FALHOU%não desligou a anterior%', 'o segredo da conexão desligada ficando guardado');
end $d$;
rollback to savepoint caso;

-- d4 · reservar sem o papel de lançar
savepoint caso;
do $d$ begin
  perform pg_temp.plantar_reservar('if not public.tem_permissao(''lancar'', m.org_id) then', 'if false then');
  perform pg_temp.reprova('%CASO 3 FALHOU%LEITOR reservou%', 'o leitor reservando');
end $d$;
rollback to savepoint caso;

-- d5 · o valor vindo de outro lugar que não o título
savepoint caso;
do $d$ begin
  perform pg_temp.plantar_reservar('values
    (v_id, m.org_id, cx.id, m.id, cx.provedor, cx.ambiente, p_tipo, m.amount,',
    'values
    (v_id, m.org_id, cx.id, m.id, cx.provedor, cx.ambiente, p_tipo, 1,');
  perform pg_temp.reprova('%CASO 3 FALHOU%não saiu do título%', 'o valor da cobrança diferente do título');
end $d$;
rollback to savepoint caso;

-- d6 · o cliente registra o resultado
savepoint caso;
do $d$ begin
  grant execute on function public.cobranca_banco_registrar(uuid, jsonb) to authenticated;
  perform pg_temp.reprova('%CASO 6 FALHOU%SESSÃO DO CLIENTE gravou%', 'o lançador gravando um Pix alheio');
end $d$;
rollback to savepoint caso;

-- d7 · processando tratado como reservada (sem devolver a mesma)
savepoint caso;
do $d$ begin
  perform pg_temp.plantar_reservar('elsif c.situacao in (''processando'', ''incerta'') then', 'elsif false then');
  perform pg_temp.reprova('%CASO 7 FALHOU%PROCESSANDO%', 'o clique depois do "processando" sem conferir no banco');
end $d$;
rollback to savepoint caso;

-- d8 · a consulta que falha rebaixa quem tem o id
savepoint caso;
do $d$ begin
  perform pg_temp.plantar_registrar('if v_sit = ''incerta'' and c.situacao in (''processando'', ''emitida'', ''a_cancelar'') then',
    'if false then');
  perform pg_temp.plantar_registrar('when ''processando'' then v_sit in (''processando'',''emitida'',''paga'',''cancelada'',''falhou'')',
    'when ''processando'' then v_sit in (''processando'',''emitida'',''paga'',''cancelada'',''falhou'',''incerta'')');
  perform pg_temp.reprova('%CASO 7 FALHOU%REBAIXOU%', 'a consulta com erro esquecendo o id do banco');
end $d$;
rollback to savepoint caso;

-- d9 · incerta vira falhou (e libera a segunda)
savepoint caso;
do $d$ begin
  perform pg_temp.plantar_registrar('when ''incerta''     then v_sit in (''processando'',''emitida'',''paga'',''cancelada'',''incerta'')',
    'when ''incerta''     then v_sit in (''processando'',''emitida'',''paga'',''cancelada'',''incerta'',''falhou'')');
  perform pg_temp.reprova('%CASO 7 FALHOU%INCERTA virou "falhou"%', 'o boleto que pode existir dado como falho');
end $d$;
rollback to savepoint caso;

-- d10 · o id do banco trocado
savepoint caso;
do $d$ begin
  perform pg_temp.plantar_registrar('if c.id_provedor is not null and v_idp is not null and v_idp <> c.id_provedor then',
    'if false then');
  perform pg_temp.reprova('%CASO 6 FALHOU%TROCADO%', 'a cobrança apontando para outro boleto no banco');
end $d$;
rollback to savepoint caso;

-- d11 · o título muda e a cobrança antiga segue emitida
savepoint caso;
do $d$ begin
  perform pg_temp.plantar('public.cobranca_banco_titulo_mudou()'::regprocedure,
    'if new.amount is distinct from old.amount', 'if false and new.amount is distinct from old.amount');
  perform pg_temp.reprova('%CASO 8 FALHOU%a_cancelar%', 'o boleto do valor antigo continuando pagável');
end $d$;
rollback to savepoint caso;

-- d12 · cobrar título a pagar
savepoint caso;
do $d$ begin
  perform pg_temp.plantar_reservar('if m.type <> ''entrada'' then', 'if false then');
  perform pg_temp.reprova('%CASO 4 FALHOU%a PAGAR%', 'a cobrança de um título a pagar');
end $d$;
rollback to savepoint caso;

-- d13 · sem conferir a Pinbank
savepoint caso;
do $d$ begin
  perform pg_temp.plantar_reservar('if exists (select 1 from public.pinbank_cobrancas', 'if false and exists (select 1 from public.pinbank_cobrancas');
  perform pg_temp.reprova('%CASO 9 FALHOU%uma em cada banco%', 'o mesmo título cobrado pela Pinbank e pelo Inter');
end $d$;
rollback to savepoint caso;

-- d14 · a empresa errada
savepoint caso;
do $d$ begin
  perform pg_temp.plantar_reservar('if not found or m.org_id is distinct from public.auth_org_id() then', 'if not found then');
  perform pg_temp.plantar_reservar('if not public.tem_permissao(''lancar'', m.org_id) then', 'if not public.tem_permissao(''lancar'', public.auth_org_id()) then');
  perform pg_temp.reprova('%CASO 10 FALHOU%empresa B reservou%', 'a empresa B cobrando o cliente da A');
end $d$;
rollback to savepoint caso;

-- d15 · desconectar sem apagar o segredo
savepoint caso;
do $d$ begin
  perform pg_temp.plantar('public.cobranca_banco_desconectar(text)'::regprocedure,
    'where s.conexao_id = c.id and c.org_id = v_org', 'where false and s.conexao_id = c.id and c.org_id = v_org');
  perform pg_temp.plantar('public.cobranca_banco_credencial(uuid)'::regprocedure,
    'where id = p_conexao and desligada_em is null', 'where id = p_conexao');
  perform pg_temp.reprova('%CASO 10 FALHOU%continuou legível%', 'a credencial da conta desconectada ainda abrindo');
end $d$;
rollback to savepoint caso;

do $fim$ begin raise notice 'cobranca-banco: 10 casos · 15 defeitos plantados pegos · a fechadura confere'; end $fim$;

rollback;
