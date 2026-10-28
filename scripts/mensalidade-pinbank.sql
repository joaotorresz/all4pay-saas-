-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA DA MENSALIDADE DO ERP PELA PINBANK DA QUATTRO — a fechadura no banco
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/mensalidade-pinbank.sql
--
-- Prova a migration 20261029140000:
--
--   1. só a PLATAFORMA gera a fatura; o mês não se repete; vencimento no
--      passado é recusado;
--   2. a empresa B não vê nem reserva a fatura da A; o LEITOR da A não paga;
--   3. a reserva tira valor, vencimento e pagador da FATURA e do cadastro, e
--      NÃO carrega o código da conta que recebe (ele mora no servidor);
--   4. o segundo clique: reservada recusa, emitida devolve a MESMA;
--   5. só o SERVIDOR registra, uma vez; `incerta` trava nova emissão;
--   6. a baixa renova a assinatura (fim do período + 1 mês), vira `active`, e
--      não se repete;
--   7. cancelar exige motivo e só vale para fatura aberta; ninguém escreve
--      direto nas tabelas.
--
-- E os DEFEITOS PLANTADOS no fim: cada um reescreve uma função num savepoint
-- e exige que a prova REPROVE pelo motivo certo. Tudo termina em ROLLBACK.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

begin;

------------------------------------------------------------------ montagem ---
do $montagem$
declare
  ua uuid := gen_random_uuid();   -- titular da empresa A
  ul uuid := gen_random_uuid();   -- leitor da empresa A
  ub uuid := gen_random_uuid();   -- titular da empresa B
  up uuid := gen_random_uuid();   -- administrador da PLATAFORMA
  oa uuid; ob uuid;
begin
  insert into auth.users (id, email) values
    (ua, 'mens-a@guarda.local'), (ul, 'mens-leitor@guarda.local'),
    (ub, 'mens-b@guarda.local'), (up, 'mens-plataforma@guarda.local');
  select om.org_id into oa from public.organization_members om where om.user_id = ua limit 1;
  select om.org_id into ob from public.organization_members om where om.user_id = ub limit 1;
  if oa is null or ob is null or oa = ob then
    raise exception 'GUARDA INVÁLIDA: o provisionamento não criou duas empresas.';
  end if;
  insert into public.organization_members (org_id, user_id, role) values (oa, ul, 'leitor')
    on conflict (org_id, user_id) do update set role = 'leitor';
  insert into public.user_active_org (user_id, org_id) values (ul, oa)
    on conflict (user_id) do update set org_id = excluded.org_id;
  insert into public.platform_admin_permitidos (email, motivo)
  values ('mens-plataforma@guarda.local', 'guarda da mensalidade (desfeita no fim)')
  on conflict do nothing;
  insert into public.platform_admins (user_id, exige_mfa) values (up, false)
    on conflict (user_id) do update set exige_mfa = false, expira_em = null;

  insert into public.company_profiles (org_id, profile)
  values (oa, jsonb_build_object('db', jsonb_build_object(
    'razaoSocial', 'Empresa A da Guarda Ltda', 'cnpj', '11.222.333/0001-81', 'email', 'financeiro@guarda.local',
    'cep', '01310100', 'rua', 'Avenida Paulista', 'numero', '1000', 'bairro', 'Bela Vista',
    'cidade', 'São Paulo', 'estado', 'SP')))
  on conflict (org_id) do update set profile = excluded.profile;

  -- O fim do período no FUTURO: é o que separa "renova do fim" de "renova de hoje".
  insert into public.subscriptions (org_id, status, current_period_end)
  values (oa, 'trial', (now() at time zone 'America/Sao_Paulo')::date + 10)
  on conflict (org_id) do update set status = 'trial', current_period_end = excluded.current_period_end;

  perform set_config('guarda.ua', ua::text, true);
  perform set_config('guarda.ul', ul::text, true);
  perform set_config('guarda.ub', ub::text, true);
  perform set_config('guarda.up', up::text, true);
  perform set_config('guarda.oa', oa::text, true);
  perform set_config('guarda.ob', ob::text, true);
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

create or replace function pg_temp.gerar(p_org uuid, p_comp date, p_valor numeric default 490) returns uuid language plpgsql as $$
declare f uuid;
begin
  perform pg_temp.como(current_setting('guarda.up')::uuid);
  set local role authenticated;
  f := public.admin_mensalidade_gerar(p_org, p_comp, p_valor, null);
  reset role;
  return f;
end $$;

create or replace function pg_temp.reservar(p_user uuid, p_fatura uuid, p_tipo text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.como(p_user);
  set local role authenticated;
  r := public.mensalidade_reservar(p_fatura, p_tipo);
  reset role;
  return r;
end $$;

create or replace function pg_temp.registrar(p_id uuid, p_res jsonb) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role service_role;
  perform public.mensalidade_registrar(p_id, p_res);
  reset role;
end $$;

create or replace function pg_temp.baixar(p_fatura uuid) returns date language plpgsql as $$
declare d date;
begin
  perform pg_temp.como(current_setting('guarda.up')::uuid);
  set local role authenticated;
  d := public.admin_mensalidade_baixar(p_fatura, 'Pix conferido no extrato da Quattro');
  reset role;
  return d;
end $$;

grant execute on all functions in schema pg_temp to authenticated, service_role;

-- ═══ A PROVA ═══
create or replace function pg_temp.prova() returns void language plpgsql as $$
declare
  ua uuid := current_setting('guarda.ua')::uuid;
  ul uuid := current_setting('guarda.ul')::uuid;
  ub uuid := current_setting('guarda.ub')::uuid;
  oa uuid := current_setting('guarda.oa')::uuid;
  ob uuid := current_setting('guarda.ob')::uuid;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  f uuid; f2 uuid; fb uuid; r jsonb; r2 jsonb; msg text; n int; d date; fim_antes date; esperado date;
begin
  -- 1. só a plataforma gera
  msg := pg_temp.erro_como(ua, format('select public.admin_mensalidade_gerar(%L, current_date, 490, null)', oa));
  if msg is null then
    raise exception 'CASO 1 FALHOU: o TITULAR da empresa gerou a própria fatura.';
  end if;
  f := pg_temp.gerar(oa, hoje);
  msg := pg_temp.erro_como(current_setting('guarda.up')::uuid,
    format('select public.admin_mensalidade_gerar(%L, %L::date, 490, null)', oa, hoje));
  if msg is null or msg not like '%já tem fatura%' then
    raise exception 'CASO 1 FALHOU: o MESMO MÊS ganhou duas faturas (veio: %).', coalesce(msg, 'aceito');
  end if;
  msg := pg_temp.erro_como(current_setting('guarda.up')::uuid,
    format('select public.admin_mensalidade_gerar(%L, %L::date, 490, %L::date)', oa, (hoje + interval '1 month')::date, hoje - 1));
  if msg is null or msg not like '%no passado%' then
    raise exception 'CASO 1 FALHOU: fatura com vencimento no PASSADO (veio: %).', coalesce(msg, 'aceito');
  end if;

  -- 2. a empresa B e o leitor
  msg := pg_temp.erro_como(ub, format('select public.mensalidade_reservar(%L, ''pix'')', f));
  if msg is null or msg not like '%não encontrada na empresa aberta%' then
    raise exception 'CASO 2 FALHOU: a empresa B reservou a fatura da A (veio: %).', coalesce(msg, 'aceito');
  end if;
  perform pg_temp.como(ub);
  set local role authenticated;
  select count(*) into n from public.mensalidade_faturas where id = f;
  reset role;
  if n <> 0 then
    raise exception 'CASO 2 FALHOU: a empresa B LEU a fatura da A.';
  end if;
  msg := pg_temp.erro_como(ul, format('select public.mensalidade_reservar(%L, ''pix'')', f));
  if msg is null or msg not like '%só quem administra%' then
    raise exception 'CASO 2 FALHOU: o LEITOR gerou o Pix da mensalidade (veio: %).', coalesce(msg, 'aceito');
  end if;

  -- 3. a reserva
  r := pg_temp.reservar(ua, f, 'pix');
  if (r->>'existente')::boolean or (r->>'valor')::numeric <> 490 or (r->>'vencimento')::date <> (select vencimento from public.mensalidade_faturas where id = f) then
    raise exception 'CASO 3 FALHOU: a reserva não saiu da FATURA (veio: %).', r;
  end if;
  if r->'devedor'->>'documento' <> '11222333000181' or r->'devedor'->>'nome' <> 'Empresa A da Guarda Ltda' then
    raise exception 'CASO 3 FALHOU: o pagador não saiu do cadastro da empresa (veio: %).', r->'devedor';
  end if;
  if r ? 'codigoCliente' or r::text ilike '%codigo%cliente%' then
    raise exception 'CASO 3 FALHOU: a reserva levou o CÓDIGO DA CONTA que recebe.';
  end if;

  -- 4. o segundo clique
  msg := pg_temp.erro_como(ua, format('select public.mensalidade_reservar(%L, ''pix'')', f));
  if msg is null or msg not like '%sendo gerada%' then
    raise exception 'CASO 4 FALHOU: duas reservas vivas da mesma fatura (veio: %).', coalesce(msg, 'aceito');
  end if;

  -- 5. só o servidor registra, uma vez
  msg := pg_temp.erro_como(ua, format('select public.mensalidade_registrar(%L, ''{"situacao":"emitida"}'')', r->>'id'));
  if msg is null or msg not like '%permission denied%' then
    raise exception 'CASO 5 FALHOU: a SESSÃO DO CLIENTE registrou o resultado (veio: %).', coalesce(msg, 'aceito');
  end if;
  perform pg_temp.registrar((r->>'id')::uuid,
    '{"situacao":"emitida","pinbankId":"PB-GUARDA","txid":"TXGUARDA","textoQrCode":"00020126guarda"}');
  msg := pg_temp.erro_servidor(format('select public.mensalidade_registrar(%L, ''{"situacao":"falhou","motivo":"x"}'')', r->>'id'));
  if msg is null or msg not like '%não se reescreve%' then
    raise exception 'CASO 5 FALHOU: o resultado da cobrança foi REESCRITO (veio: %).', coalesce(msg, 'aceito');
  end if;
  r2 := pg_temp.reservar(ua, f, 'pix');
  if not (r2->>'existente')::boolean or r2->>'id' <> r->>'id' then
    raise exception 'CASO 4 FALHOU: a emitida não voltou como a MESMA (veio: %).', r2;
  end if;
  r2 := pg_temp.reservar(ua, f, 'boleto');
  perform pg_temp.registrar((r2->>'id')::uuid, '{"situacao":"incerta","motivo":"a Pinbank não respondeu"}');
  msg := pg_temp.erro_como(ua, format('select public.mensalidade_reservar(%L, ''boleto'')', f));
  if msg is null or msg not like '%pode existir%' then
    raise exception 'CASO 5 FALHOU: gerou OUTRO boleto com o anterior incerto (veio: %).', coalesce(msg, 'aceito');
  end if;

  -- 6. a baixa renova
  select current_period_end into fim_antes from public.subscriptions where org_id = oa;
  esperado := (greatest(coalesce(fim_antes, hoje), hoje) + interval '1 month')::date;
  d := pg_temp.baixar(f);
  if d is distinct from esperado
     or (select current_period_end from public.subscriptions where org_id = oa) is distinct from esperado then
    raise exception 'CASO 6 FALHOU: a baixa não renovou até % (veio %).', esperado, d;
  end if;
  if (select status from public.subscriptions where org_id = oa) <> 'active' then
    raise exception 'CASO 6 FALHOU: pagou e a assinatura não ficou ATIVA.';
  end if;
  if (select situacao from public.mensalidade_faturas where id = f) <> 'paga' then
    raise exception 'CASO 6 FALHOU: a fatura baixada não ficou PAGA.';
  end if;
  msg := pg_temp.erro_como(current_setting('guarda.up')::uuid, format('select public.admin_mensalidade_baixar(%L, null)', f));
  if msg is null or msg not like '%não se repete%' then
    raise exception 'CASO 6 FALHOU: a MESMA fatura renovou duas vezes (veio: %).', coalesce(msg, 'aceito');
  end if;
  msg := pg_temp.erro_como(ua, format('select public.admin_mensalidade_baixar(%L, null)', f));
  if msg is null then
    raise exception 'CASO 6 FALHOU: o CLIENTE deu baixa na própria mensalidade.';
  end if;

  -- 7. cancelar e escrita direta
  fb := pg_temp.gerar(ob, hoje, 300);
  msg := pg_temp.erro_como(current_setting('guarda.up')::uuid, format('select public.admin_mensalidade_cancelar(%L, ''x'')', fb));
  if msg is null or msg not like '%motivo%' then
    raise exception 'CASO 7 FALHOU: cancelou sem motivo (veio: %).', coalesce(msg, 'aceito');
  end if;
  msg := pg_temp.erro_como(current_setting('guarda.up')::uuid, format('select public.admin_mensalidade_cancelar(%L, ''pago por fora'')', f));
  if msg is null or msg not like '%só se cancela fatura aberta%' then
    raise exception 'CASO 7 FALHOU: cancelou uma fatura PAGA (veio: %).', coalesce(msg, 'aceito');
  end if;
  msg := pg_temp.erro_como(ua, format('update public.mensalidade_faturas set situacao = ''paga'' where id = %L', f));
  if msg is null or msg not like '%permission denied%' then
    raise exception 'CASO 7 FALHOU: o cliente ESCREVEU direto na fatura (veio: %).', coalesce(msg, 'aceito');
  end if;
  msg := pg_temp.erro_como(ua, format('insert into public.mensalidade_faturas (org_id, competencia, valor, vencimento) values (%L, date_trunc(''month'', now())::date + 31, 1, current_date + 5)', oa));
  if msg is null or msg not like '%permission denied%' then
    raise exception 'CASO 7 FALHOU: o cliente CRIOU a própria fatura (veio: %).', coalesce(msg, 'aceito');
  end if;
end $$;

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
grant execute on all functions in schema pg_temp to authenticated, service_role;

-- d1 · o cliente gera a própria fatura
savepoint caso;
do $d$ begin
  perform pg_temp.plantar('public.admin_mensalidade_gerar(uuid,date,numeric,date)'::regprocedure,
    'perform public.admin_exigir_acesso(''admin_mensalidade_gerar'', p_org::text);', 'perform 1;');
  perform pg_temp.reprova('%CASO 1 FALHOU%TITULAR%', 'a empresa gerando a própria fatura');
end $d$;
rollback to savepoint caso;

-- d2 · reservar a fatura de outra empresa
savepoint caso;
do $d$ begin
  perform pg_temp.plantar('public.mensalidade_reservar(uuid,text)'::regprocedure,
    'if not found or f.org_id is distinct from public.auth_org_id() then', 'if not found then');
  perform pg_temp.reprova('%CASO 2 FALHOU%empresa B reservou%', 'a empresa B pagando a fatura da A');
end $d$;
rollback to savepoint caso;

-- d3 · o leitor paga
savepoint caso;
do $d$ begin
  perform pg_temp.plantar('public.mensalidade_reservar(uuid,text)'::regprocedure,
    'if not public.tem_permissao(''administrar'', f.org_id) then', 'if false then');
  perform pg_temp.reprova('%CASO 2 FALHOU%LEITOR%', 'o leitor gerando o Pix');
end $d$;
rollback to savepoint caso;

-- d4 · nova emissão com a anterior incerta
savepoint caso;
do $d$ begin
  perform pg_temp.plantar('public.mensalidade_reservar(uuid,text)'::regprocedure,
    'situacao in (''reservada'',''emitida'',''incerta'') limit 1', 'situacao in (''reservada'',''emitida'') limit 1');
  perform pg_temp.reprova('%CASO 5 FALHOU%incerto%', 'outro boleto com o anterior incerto');
end $d$;
rollback to savepoint caso;

-- d5 · a baixa conta de hoje e come os dias pagos adiantado
savepoint caso;
do $d$ begin
  perform pg_temp.plantar('public.mensalidade_renovar(uuid,uuid,text)'::regprocedure,
    'greatest(coalesce(s.current_period_end, v_hoje), v_hoje)', 'v_hoje');
  perform pg_temp.reprova('%CASO 6 FALHOU%não renovou%', 'a renovação contando de hoje');
end $d$;
rollback to savepoint caso;

-- d6 · o resultado se reescreve
savepoint caso;
do $d$ begin
  perform pg_temp.plantar('public.mensalidade_registrar(uuid,jsonb)'::regprocedure,
    'if c.situacao <> ''reservada'' then', 'if false then');
  perform pg_temp.reprova('%CASO 5 FALHOU%REESCRITO%', 'o resultado da cobrança reescrito');
end $d$;
rollback to savepoint caso;

do $fim$ begin raise notice 'mensalidade-pinbank: 7 casos · 6 defeitos plantados pegos · a fechadura confere'; end $fim$;

rollback;
