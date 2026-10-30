-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA DO PIX ATUALIZADO — o Pix do dia na fatura vencida (20261031140000)
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/pix-atualizado.sql
--
--   1. a reserva só roda como o SERVIDOR (a página é pública);
--   2. o valor pedido tem de bater com a regra do boleto e os dias de atraso;
--   3. o valor certo reserva um Pix do dia, ao lado do Pix original vivo;
--   4. dois cliques: o segundo espera o primeiro, não emite outro;
--   5. emitido, o pedido seguinte devolve o MESMO Pix;
--   6. a página mostra o Pix de hoje e nunca o de ontem;
--   7. título no prazo não gera Pix do dia;
--   8. no máximo 3 tentativas por título e por dia.
--
-- Arreio copiado de `pinbank-checkout.sql`; defeitos plantados no fim, lendo
-- a mensagem. Termina em ROLLBACK.
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
  oa uuid; ob uuid; ca uuid; pa uuid;
begin
  insert into auth.users (id, email) values
    (ua, 'pxa-a@guarda.local'), (ul, 'pxa-leitor@guarda.local'),
    (ub, 'pxa-b@guarda.local'), (up, 'pxa-plataforma@guarda.local');
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
  values ('pxa-plataforma@guarda.local', 'guarda do Pix atualizado (desfeita no fim)')
  on conflict do nothing;
  insert into public.platform_admins (user_id, exige_mfa) values (up, false)
    on conflict (user_id) do update set exige_mfa = false, expira_em = null;

  select a.id into ca from public.financial_accounts a
   where a.org_id = oa and a.excluido_em is null and a.ativo order by a.created_at limit 1;
  if ca is null then
    raise exception 'GUARDA INVÁLIDA: a empresa A nasceu sem conta ativa (o seed mudou?).';
  end if;
  insert into public.parties (org_id, type, name, doc, is_customer, email, zip, street, number, district, city, state)
  values (oa, 'pj', 'Cliente da cobrança', '11.222.333/0001-81', true, 'cliente@guarda.local',
          '01310100', 'Avenida Paulista', '1000', 'Bela Vista', 'São Paulo', 'SP')
  returning id into pa;
  -- O cadastro da empresa: chaves que a fatura MOSTRA e chaves que ela NÃO pode
  -- mostrar (logo embutido, faturamento, regime, o representante).
  insert into public.company_profiles (org_id, profile) values (oa, jsonb_build_object('db', jsonb_build_object(
    'fantasia', 'Padaria da guarda', 'razaoSocial', 'Padaria da Guarda Ltda', 'cnpj', '11.444.777/0001-61',
    'email', 'financeiro@guarda.local', 'telefone', '11987654321', 'rua', 'Rua das Flores', 'numero', '10',
    'cidade', 'São Paulo', 'estado', 'SP', 'cep', '01001000',
    'logo', 'data:image/png;base64,AAAA', 'faturamentoMensal', 90000, 'regime', 'Simples Nacional',
    'representanteCpf', '529.982.247-25')))
  on conflict (org_id) do update set profile = excluded.profile;

  perform set_config('guarda.ua', ua::text, true);
  perform set_config('guarda.ul', ul::text, true);
  perform set_config('guarda.ub', ub::text, true);
  perform set_config('guarda.up', up::text, true);
  perform set_config('guarda.oa', oa::text, true);
  perform set_config('guarda.ob', ob::text, true);
  perform set_config('guarda.ca', ca::text, true);
  perform set_config('guarda.pa', pa::text, true);
  -- ⚠️ Estabelecimento e código que NÃO existem neste banco (o índice é global).
  perform set_config('guarda.estab', (select coalesce(max(estabelecimento_id), 0) + 3000 from public.pinbank_vinculos)::text, true);
  perform set_config('guarda.codigo', (select coalesce(max(codigo_cliente), 0) + 7000 from public.pinbank_vinculos)::text, true);
end
$montagem$;

create or replace function pg_temp.como(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
end $$;

-- Executa um comando como a pessoa e devolve a mensagem de erro (ou null).
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

create or replace function pg_temp.reservar(p_user uuid, p_mov uuid, p_tipo text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.como(p_user);
  set local role authenticated;
  r := public.pinbank_cobranca_reservar(p_mov, p_tipo);
  reset role;
  return r;
end $$;

create or replace function pg_temp.registrar(p_id uuid, p_res jsonb) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role service_role;
  perform public.pinbank_cobranca_registrar(p_id, p_res);
  reset role;
end $$;

create or replace function pg_temp.titulo(p_dias int default 10) returns uuid language plpgsql as $$
declare t uuid;
begin
  insert into public.movements (org_id, account_id, type, amount, description, due_date, origem, situacao,
                                lancado_por, party_id, category)
  values (current_setting('guarda.oa')::uuid, current_setting('guarda.ca')::uuid, 'entrada'::movement_type, 250.40,
          'Mensalidade da guarda', (now() at time zone 'America/Sao_Paulo')::date + p_dias, 'manual', 'previsto', current_setting('guarda.ua')::uuid,
          current_setting('guarda.pa')::uuid, 'Vendas')
  returning id into t;
  return t;
end $$;

-- A plataforma vincula (com o código); o titular ativa a maquininha.
create or replace function pg_temp.vincular(p_codigo boolean default true) returns uuid language plpgsql as $$
declare v uuid;
begin
  perform pg_temp.como(current_setting('guarda.up')::uuid);
  set local role authenticated;
  v := public.admin_pinbank_vincular(current_setting('guarda.oa')::uuid, current_setting('guarda.estab')::bigint, null,
         'Loja da cobrança', case when p_codigo then current_setting('guarda.codigo')::bigint end);
  reset role;
  perform pg_temp.como(current_setting('guarda.ua')::uuid);
  set local role authenticated;
  perform public.pinbank_configurar_vinculo(v, current_setting('guarda.ca')::uuid,
    '{"debito":0.0199,"credito_vista":0.035}'::jsonb, '{}'::jsonb, false, true);
  reset role;
  return v;
end $$;

create or replace function pg_temp.ligar(p_vinculo uuid) returns void language plpgsql as $$
begin
  perform pg_temp.como(current_setting('guarda.ua')::uuid);
  set local role authenticated;
  perform public.pinbank_cobranca_configurar(p_vinculo, true);
  reset role;
end $$;

create or replace function pg_temp.emitir_pix(p_mov uuid) returns uuid language plpgsql as $$
declare r jsonb;
begin
  r := pg_temp.reservar(current_setting('guarda.ua')::uuid, p_mov, 'pix');
  perform pg_temp.registrar((r->>'id')::uuid, jsonb_build_object('situacao', 'emitida',
    'textoQrCode', '00020126580014br.gov.bcb.pix-guarda', 'txid', 'guarda'));
  return (r->>'id')::uuid;
end $$;

create or replace function pg_temp.criar(p_user uuid, p_mov uuid) returns text language plpgsql as $$
declare t text;
begin
  perform pg_temp.como(p_user);
  set local role authenticated;
  t := public.pinbank_checkout_link_criar(p_mov);
  reset role;
  return t;
end $$;

create or replace function pg_temp.ler(p_token text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role service_role;
  r := public.pinbank_checkout_ler(p_token);
  reset role;
  return r;
end $$;
grant execute on all functions in schema pg_temp to authenticated, service_role, anon;

-- O boleto emitido com a regra que o banco registrou: 2% de multa, 1% ao mês.
create or replace function pg_temp.emitir_boleto(p_mov uuid) returns uuid language plpgsql as $$
declare r jsonb;
begin
  r := pg_temp.reservar(current_setting('guarda.ua')::uuid, p_mov, 'boleto');
  perform pg_temp.registrar((r->>'id')::uuid, jsonb_build_object('situacao', 'emitida',
    'linhaDigitavel', '34191790010104351004791020150008291070026000123', 'pinbankId', 'guarda-boleto',
    'encargos', jsonb_build_object('multaPct', 2, 'jurosMesPct', 1, 'carenciaDias', 0, 'aceitarAteDias', 30)));
  return (r->>'id')::uuid;
end $$;

-- A reserva do Pix do dia, como o SERVIDOR (a rota pública).
create or replace function pg_temp.pix(p_token text, p_valor numeric) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role service_role;
  r := public.pinbank_checkout_pix_reservar(p_token, p_valor);
  reset role;
  return r;
end $$;

create or replace function pg_temp.erro_pix(p_token text, p_valor numeric) returns text language plpgsql as $$
declare msg text;
begin
  begin
    perform pg_temp.pix(p_token, p_valor);
    return null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  return msg;
end $$;
grant execute on all functions in schema pg_temp to authenticated, service_role, anon;

-- ═══ A PROVA ═══
-- 250,40 vencido há 10 dias: multa 5,01 + juros 0,83 = 256,24.
create or replace function pg_temp.prova_pix() returns void language plpgsql as $$
declare
  ua uuid := current_setting('guarda.ua')::uuid;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v uuid; t uuid; t2 uuid; t3 uuid; b uuid; tk text; tk2 text; tk3 text; r jsonb; r2 jsonb; msg text; i int;
begin
  v := pg_temp.vincular(true);
  perform pg_temp.ligar(v);
  t := pg_temp.titulo(-10);
  perform pg_temp.emitir_pix(t);      -- o Pix ORIGINAL, vivo
  b := pg_temp.emitir_boleto(t);
  tk := pg_temp.criar(ua, t);

  -- 1. só o servidor
  msg := pg_temp.erro_como(ua, format('select public.pinbank_checkout_pix_reservar(%L, 256.24)', tk));
  if msg is null or msg not like '%permission denied%' then
    raise exception 'CASO 1 FALHOU: uma SESSÃO de cliente reservou o Pix do dia (veio: %).', coalesce(msg, 'aceito');
  end if;

  -- 2. o valor tem de bater
  msg := pg_temp.erro_pix(tk, 250.40);
  if msg is null or msg not like '%não confere%' then
    raise exception 'CASO 2 FALHOU: reservou Pix do dia com o valor SEM multa e juros (veio: %).', coalesce(msg, 'aceito');
  end if;

  -- 3. o valor certo reserva, ao lado do Pix original vivo
  begin
    r := pg_temp.pix(tk, 256.24);
  exception when others then
    raise exception 'CASO 3 FALHOU: o Pix do dia não reservou com o valor certo (%).', SQLERRM;
  end;
  if (r->>'existente')::boolean or (r->>'valor')::numeric <> 256.24 or (r->>'diaReferencia')::date <> hoje
     or (r->>'tipo') <> 'pix' then
    raise exception 'CASO 3 FALHOU: a reserva não é o Pix de hoje com 256,24 (veio: %).', r;
  end if;
  if not exists (select 1 from public.pinbank_cobrancas where id = (r->>'id')::uuid and origem_regra = b and vencimento = hoje) then
    raise exception 'CASO 3 FALHOU: o Pix do dia não aponta o boleto da regra.';
  end if;

  -- 4. o segundo clique espera
  msg := pg_temp.erro_pix(tk, 256.24);
  if msg is null or msg not like '%já está sendo gerado%' then
    raise exception 'CASO 4 FALHOU: o segundo clique reservou OUTRO Pix do dia (veio: %).', coalesce(msg, 'aceito');
  end if;

  -- 5. emitido, o seguinte devolve o mesmo
  perform pg_temp.registrar((r->>'id')::uuid, jsonb_build_object('situacao', 'emitida',
    'textoQrCode', '00020126580014br.gov.bcb.pix-do-dia', 'txid', 'guarda-dia'));
  r2 := pg_temp.pix(tk, 256.24);
  if not (r2->>'existente')::boolean or r2->>'id' <> r->>'id' then
    raise exception 'CASO 5 FALHOU: com o Pix de hoje emitido, o pedido não devolveu o mesmo (veio: %).', r2;
  end if;

  -- 6. a página: o de hoje sim, o de ontem não
  insert into public.pinbank_cobrancas (org_id, vinculo_id, movement_id, tipo, valor, vencimento, codigo_cliente,
                                        dia_referencia, origem_regra, situacao, texto_qrcode, emitida_em, criado_por)
  values (current_setting('guarda.oa')::uuid, v, t, 'pix', 256.15, hoje - 1, current_setting('guarda.codigo')::bigint,
          hoje - 1, b, 'emitida', '00020126580014br.gov.bcb.pix-de-ontem', now(),
          (select criado_por from public.pinbank_cobrancas where id = b));
  r := pg_temp.ler(tk);
  if not exists (select 1 from jsonb_array_elements(r->'cobrancas') x where x->>'textoQrCode' like '%pix-do-dia'
                   and (x->>'diaReferencia')::date = hoje) then
    raise exception 'CASO 6 FALHOU: a página não mostra o Pix de hoje (veio: %).', r->'cobrancas';
  end if;
  if exists (select 1 from jsonb_array_elements(r->'cobrancas') x where x->>'textoQrCode' like '%pix-de-ontem') then
    raise exception 'CASO 6 FALHOU: a página mostra o Pix de ONTEM, vencido às 23:59.';
  end if;

  -- 7. no prazo, não
  t2 := pg_temp.titulo(10);
  perform pg_temp.emitir_boleto(t2);
  tk2 := pg_temp.criar(ua, t2);
  msg := pg_temp.erro_pix(tk2, 250.40);
  if msg is null or msg not like '%ainda está no prazo%' then
    raise exception 'CASO 7 FALHOU: gerou Pix do dia para título no prazo (veio: %).', coalesce(msg, 'aceito');
  end if;

  -- 8. três tentativas por dia
  t3 := pg_temp.titulo(-10);
  perform pg_temp.emitir_boleto(t3);
  tk3 := pg_temp.criar(ua, t3);
  for i in 1..3 loop
    r := pg_temp.pix(tk3, 256.24);
    perform pg_temp.registrar((r->>'id')::uuid, jsonb_build_object('situacao', 'falhou', 'motivo', 'guarda'));
  end loop;
  msg := pg_temp.erro_pix(tk3, 256.24);
  if msg is null or msg not like '%não foi possível gerar o Pix hoje%' then
    raise exception 'CASO 8 FALHOU: passou de 3 tentativas no dia (veio: %).', coalesce(msg, 'aceito');
  end if;
end $$;
grant execute on all functions in schema pg_temp to authenticated, service_role, anon;

savepoint caso;
select pg_temp.prova_pix();
rollback to savepoint caso;

-- ── defeitos plantados ──────────────────────────────────────────────────────
create or replace function pg_temp.reprova(p_padrao text, p_nome text) returns void language plpgsql as $$
declare msg text;
begin
  begin
    perform pg_temp.prova_pix();
  exception when others then
    msg := SQLERRM;
  end;
  if msg is null then
    raise exception 'GUARDA CEGA: o defeito "%" passou.', p_nome;
  end if;
  if msg not like p_padrao then
    raise exception 'VERMELHO PELO MOTIVO ERRADO ("%"): %', p_nome, msg;
  end if;
end $$;
grant execute on all functions in schema pg_temp to authenticated, service_role, anon;

savepoint caso;
grant execute on function public.pinbank_checkout_pix_reservar(text, numeric) to authenticated;
select pg_temp.reprova('%CASO 1 FALHOU%', 'a sessão do cliente reserva');
rollback to savepoint caso;

savepoint caso;
do $d$ declare def text := pg_get_functiondef('public.pinbank_checkout_pix_reservar(text,numeric)'::regprocedure); begin
  execute replace(def, 'if p_valor is null or abs(p_valor - v_total) > 0.01 then', 'if p_valor is null then');
end $d$;
select pg_temp.reprova('%CASO 2 FALHOU%', 'sem conferir o valor');
rollback to savepoint caso;

savepoint caso;
drop index public.pinbank_cobrancas_viva_unica;
create unique index pinbank_cobrancas_viva_unica on public.pinbank_cobrancas (movement_id, tipo)
  where situacao in ('reservada','emitida','incerta','a_cancelar');
select pg_temp.reprova('%CASO 3 FALHOU%', 'o índice antigo barra o Pix do dia');
rollback to savepoint caso;

savepoint caso;
do $d$ declare def text := pg_get_functiondef('public.pinbank_checkout_ler(text)'::regprocedure); begin
  execute replace(def, 'and (c.dia_referencia is null or c.dia_referencia = (now() at time zone ''America/Sao_Paulo'')::date)', '');
end $d$;
select pg_temp.reprova('%CASO 6 FALHOU%ONTEM%', 'a página mostra o Pix de ontem');
rollback to savepoint caso;

savepoint caso;
do $d$ declare def text := pg_get_functiondef('public.pinbank_checkout_pix_reservar(text,numeric)'::regprocedure); begin
  execute replace(def, 'if m.due_date is null or m.due_date >= v_hoje then', 'if m.due_date is null then');
end $d$;
select pg_temp.reprova('%CASO 7 FALHOU%', 'gera no prazo');
rollback to savepoint caso;

savepoint caso;
do $d$ declare def text := pg_get_functiondef('public.pinbank_checkout_pix_reservar(text,numeric)'::regprocedure); begin
  execute replace(def, 'if n_tentativas >= 3 then', 'if n_tentativas >= 300 then');
end $d$;
select pg_temp.reprova('%CASO 8 FALHOU%', 'sem teto de tentativas');
rollback to savepoint caso;

rollback;
