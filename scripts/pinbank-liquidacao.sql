-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA DA LIQUIDAÇÃO — o Pix ou o boleto do link foi pago
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/pinbank-liquidacao.sql
--
-- Prova a migration 20261104140000 (sobre as do checkout e do Pix do dia):
--
--   1. pago o Pix, a cobrança vira PAGA e o título vira RECEBIDO (baixado),
--      com a data do PAGAMENTO no caixa, a transição "pago pelo banco" na
--      trilha e o boleto do mesmo título a cancelar, com o motivo certo;
--   2. a fatura pública diz "pago";
--   3. o MESMO aviso de novo não muda nada; OUTRO aviso na cobrança paga, ou
--      o mesmo aviso em outra cobrança, é recusado;
--   4. só o servidor liquida (visitante e sessão de cliente: permission denied);
--   5. título cancelado: a cobrança vira paga, o título NÃO volta, e a fatura
--      diz "pago" (quem pagou não lê "indisponível");
--   6. valor menor que o da cobrança: paga, título NÃO baixado;
--   7. título mudou depois da emissão (a_cancelar) e o cliente pagou a velha:
--      paga, título NÃO baixado;
--   8. pago o Pix E o boleto: o segundo marca o pagamento em dobro;
--   9. a porta "pago pelo banco" é estreita: sem a marca, com a marca de OUTRO
--      título, com sessão de pessoa ou num título a PAGAR, a confirmação segue
--      pedindo pessoa, papel e alçada.
--
-- E os DEFEITOS PLANTADOS no fim, lendo a mensagem (arreio copiado de
-- `pinbank-checkout.sql`). Tudo termina em ROLLBACK.
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
    (ua, 'pbk-a@guarda.local'), (ul, 'pbk-leitor@guarda.local'),
    (ub, 'pbk-b@guarda.local'), (up, 'pbk-plataforma@guarda.local');
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
  values ('pbk-plataforma@guarda.local', 'guarda do checkout Pinbank (desfeita no fim)')
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

create or replace function pg_temp.emitir_boleto(p_mov uuid) returns uuid language plpgsql as $$
declare r jsonb;
begin
  r := pg_temp.reservar(current_setting('guarda.ua')::uuid, p_mov, 'boleto');
  perform pg_temp.registrar((r->>'id')::uuid, jsonb_build_object('situacao', 'emitida',
    'linhaDigitavel', repeat('1', 47), 'codigoBarras', repeat('2', 44)));
  return (r->>'id')::uuid;
end $$;

-- A liquidação, como o SERVIDOR (o aviso do banco chega pela rota).
create or replace function pg_temp.liquidar(p_cob uuid, p_valor numeric, p_ref text,
    p_pago_em timestamptz default '2026-11-03 23:30:00-03') returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role service_role;
  r := public.pinbank_cobranca_liquidar(p_cob, p_valor, p_pago_em, 'aviso_do_banco', p_ref);
  reset role;
  return r;
end $$;

create or replace function pg_temp.erro_liquidar(p_cob uuid, p_valor numeric, p_ref text) returns text language plpgsql as $$
declare msg text;
begin
  begin
    perform pg_temp.liquidar(p_cob, p_valor, p_ref);
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  return msg;
end $$;

-- Qual cobrança o aviso paga, como o SERVIDOR (só lê).
create or replace function pg_temp.achar(p_tipo text, p_codigo bigint, p_nsu bigint, p_txid text,
    p_pid text, p_barras text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role service_role;
  r := public.pinbank_cobranca_do_aviso(p_tipo, p_codigo, p_nsu, p_txid, p_pid, p_barras);
  reset role;
  return r;
end $$;

-- Uma cobrança emitida com as referências que a Pinbank devolveu.
create or replace function pg_temp.emitir_com(p_mov uuid, p_tipo text, p_txid text, p_pid text, p_barras text default null)
    returns uuid language plpgsql as $$
declare r jsonb;
begin
  r := pg_temp.reservar(current_setting('guarda.ua')::uuid, p_mov, p_tipo);
  perform pg_temp.registrar((r->>'id')::uuid, case p_tipo
    when 'pix' then jsonb_build_object('situacao', 'emitida', 'textoQrCode', '00020126580014br.gov.bcb.pix-aviso',
      'txid', p_txid, 'pinbankId', p_pid)
    else jsonb_build_object('situacao', 'emitida', 'linhaDigitavel', repeat('3', 47),
      'codigoBarras', coalesce(p_barras, repeat('4', 44)), 'pinbankId', p_pid) end);
  return (r->>'id')::uuid;
end $$;

-- Uma escrita como o servidor, SEM sessão de pessoa; devolve o erro (ou null).
create or replace function pg_temp.erro_servidor(p_sql text, p_marca text default null) returns text language plpgsql as $$
declare msg text;
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('a4p.liquidacao_titulo', coalesce(p_marca, ''), true);
  begin
    set local role service_role;
    execute p_sql;
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  perform set_config('a4p.liquidacao_titulo', '', true);
  return msg;
end $$;
grant execute on all functions in schema pg_temp to authenticated, service_role, anon;

-- ═══ A PROVA ═══
create or replace function pg_temp.prova_liquidacao() returns void language plpgsql as $$
declare
  ua uuid := current_setting('guarda.ua')::uuid;
  ub uuid := current_setting('guarda.ub')::uuid;
  v uuid; t uuid; pix uuid; bol uuid; tk text; r jsonb; msg text; n int; mrow public.movements%rowtype;
  cod bigint; nsu bigint; t2 uuid; pix2 uuid;
begin
  v := pg_temp.vincular(true);
  perform pg_temp.ligar(v);

  -- 1. pago o Pix: cobrança paga, título recebido, data do pagamento, trilha
  t := pg_temp.titulo();
  pix := pg_temp.emitir_pix(t);
  bol := pg_temp.emitir_boleto(t);
  tk := pg_temp.criar(ua, t);
  r := pg_temp.liquidar(pix, 250.40, 'aviso-1');
  if r->>'titulo' is distinct from 'recebido' then
    raise exception 'CASO 1 FALHOU: pago o Pix, o título não foi recebido (veio: %).', r;
  end if;
  if (select situacao from public.pinbank_cobrancas where id = pix) <> 'paga' then
    raise exception 'CASO 1 FALHOU: pago o Pix, a cobrança não ficou PAGA.';
  end if;
  select * into mrow from public.movements where id = t;
  if mrow.situacao <> 'baixado' or mrow.status <> 'pago' then
    raise exception 'CASO 1 FALHOU: o título ficou "%" e não RECEBIDO.', mrow.situacao;
  end if;
  -- 23:30 em São Paulo do dia 03 é dia 04 em UTC: o caixa é do dia 03.
  if mrow.paid_date is distinct from date '2026-11-03' then
    raise exception 'CASO 1 FALHOU: a data de pagamento do título é % e não a do PAGAMENTO (2026-11-03).', mrow.paid_date;
  end if;
  select count(*) into n from public.central_transicoes
   where movement_id = t and motivo like 'pago pelo banco:%' and por = ua;
  if n <> 2 then
    raise exception 'CASO 1 FALHOU: a trilha não tem as duas transições "pago pelo banco" por quem emitiu (veio: %).', n;
  end if;
  if (select situacao from public.pinbank_cobrancas where id = bol) <> 'a_cancelar'
     or (select motivo from public.pinbank_cobrancas where id = bol) not like '%pago por Pix%' then
    raise exception 'CASO 1 FALHOU: o boleto do título pago por Pix não ficou a cancelar com o motivo certo.';
  end if;
  if not exists (select 1 from public.audit_log where acao = 'pinbank_cobranca.liquidar' and entidade_id = pix::text) then
    raise exception 'CASO 1 FALHOU: a liquidação não deixou trilha.';
  end if;

  -- 2. a fatura diz pago
  r := pg_temp.ler(tk);
  if r->>'situacao' is distinct from 'pago' or jsonb_array_length(r->'cobrancas') <> 0 then
    raise exception 'CASO 2 FALHOU: a fatura do título pago não disse "pago" (veio: %).', r;
  end if;

  -- 3. o mesmo aviso não muda nada; outro aviso é recusado
  select count(*) into n from public.central_transicoes where movement_id = t;
  -- Recusar o aviso repetido seria pior que inútil: o banco reenviaria sem fim.
  msg := pg_temp.erro_liquidar(pix, 250.40, 'aviso-1');
  if msg is not null then
    raise exception 'CASO 3 FALHOU: o MESMO aviso de novo foi recusado, e o banco o reenviaria sem fim (veio: %).', msg;
  end if;
  r := pg_temp.liquidar(pix, 250.40, 'aviso-1');
  if (r->>'duplicado')::boolean is distinct from true
     or (select count(*) from public.central_transicoes where movement_id = t) <> n then
    raise exception 'CASO 3 FALHOU: o MESMO aviso de novo mudou alguma coisa (veio: %).', r;
  end if;
  msg := pg_temp.erro_liquidar(pix, 250.40, 'aviso-outro');
  if msg is null or msg not like '%já foi liquidada por outro aviso%' then
    raise exception 'CASO 3 FALHOU: OUTRO aviso liquidou de novo a cobrança paga (veio: %).', coalesce(msg, 'aceito');
  end if;
  msg := pg_temp.erro_liquidar(bol, 250.40, 'aviso-1');
  if msg is null or msg not like '%já liquidou outra cobrança%' then
    raise exception 'CASO 3 FALHOU: o mesmo aviso liquidou DUAS cobranças (veio: %).', coalesce(msg, 'aceito');
  end if;

  -- 4. só o servidor liquida
  begin
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    set local role anon;
    perform public.pinbank_cobranca_liquidar(bol, 1, now(), 'aviso_do_banco', 'anon');
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  if msg is null or msg not like '%permission denied%' then
    raise exception 'CASO 4 FALHOU: o VISITANTE liquidou uma cobrança (veio: %).', coalesce(msg, 'aceito');
  end if;
  msg := pg_temp.erro_como(ua, format('select public.pinbank_cobranca_liquidar(%L, 1, now(), ''aviso_do_banco'', ''sessao'')', bol));
  if msg is null or msg not like '%permission denied%' then
    raise exception 'CASO 4 FALHOU: uma SESSÃO de cliente liquidou a própria cobrança (veio: %).', coalesce(msg, 'aceito');
  end if;

  -- 5. título cancelado: paga, o título não volta, a fatura diz pago
  t := pg_temp.titulo();
  pix := pg_temp.emitir_pix(t);
  tk := pg_temp.criar(ua, t);
  update public.movements set situacao = 'cancelado' where id = t;
  r := pg_temp.liquidar(pix, 250.40, 'aviso-5');
  if r->>'titulo' is distinct from 'nao_baixado' or (select situacao from public.movements where id = t) <> 'cancelado' then
    raise exception 'CASO 5 FALHOU: o título CANCELADO mudou com o pagamento (veio: %).', r;
  end if;
  if r->>'motivo' not like '%precisa ser devolvido ou relançado%' then
    raise exception 'CASO 5 FALHOU: o motivo não diz à empresa que o valor do título cancelado precisa voltar (veio: %).', r->>'motivo';
  end if;
  if (select situacao from public.pinbank_cobrancas where id = pix) <> 'paga' then
    raise exception 'CASO 5 FALHOU: o dinheiro entrou e a cobrança do título cancelado não ficou paga.';
  end if;
  if pg_temp.ler(tk)->>'situacao' is distinct from 'pago' then
    raise exception 'CASO 5 FALHOU: quem pagou leu "%" e não "pago".', pg_temp.ler(tk)->>'situacao';
  end if;

  -- 6. valor menor
  t := pg_temp.titulo();
  pix := pg_temp.emitir_pix(t);
  r := pg_temp.liquidar(pix, 200, 'aviso-6');
  if r->>'titulo' is distinct from 'nao_baixado' or (select situacao from public.movements where id = t) <> 'previsto' then
    raise exception 'CASO 6 FALHOU: o título foi baixado com valor MENOR que o da cobrança (veio: %).', r;
  end if;

  -- 7. o título mudou e o cliente pagou a cobrança velha
  t := pg_temp.titulo();
  pix := pg_temp.emitir_pix(t);
  update public.movements set amount = 300 where id = t;
  r := pg_temp.liquidar(pix, 250.40, 'aviso-7');
  if r->>'titulo' is distinct from 'nao_baixado' or (select situacao from public.movements where id = t) <> 'previsto' then
    raise exception 'CASO 7 FALHOU: o título MUDADO foi baixado pela cobrança do valor antigo (veio: %).', r;
  end if;

  -- 8. Pix e boleto pagos: o dobro
  t := pg_temp.titulo();
  pix := pg_temp.emitir_pix(t);
  bol := pg_temp.emitir_boleto(t);
  perform pg_temp.liquidar(pix, 250.40, 'aviso-8a');
  r := pg_temp.liquidar(bol, 250.40, 'aviso-8b');
  if r->>'titulo' is distinct from 'ja_recebido' or (r->>'dobro')::boolean is distinct from true then
    raise exception 'CASO 8 FALHOU: o pagamento em DOBRO não foi apontado (veio: %).', r;
  end if;

  -- 9. a porta "pago pelo banco" é estreita
  t := pg_temp.titulo();
  msg := pg_temp.erro_servidor(format('update public.movements set situacao = ''confirmado'' where id = %L', t));
  if msg is null or msg not like '%A4P-CENTRAL-PERMISSAO%' then
    raise exception 'CASO 9 FALHOU: o servidor confirmou SEM a marca da liquidação (veio: %).', coalesce(msg, 'aceito');
  end if;
  msg := pg_temp.erro_servidor(format('update public.movements set situacao = ''confirmado'' where id = %L', t), gen_random_uuid()::text);
  if msg is null or msg not like '%A4P-CENTRAL-PERMISSAO%' then
    raise exception 'CASO 9 FALHOU: a marca de OUTRO título abriu a confirmação (veio: %).', coalesce(msg, 'aceito');
  end if;
  t := pg_temp.titulo('saida', 'Fornecedores');
  msg := pg_temp.erro_servidor(format('update public.movements set situacao = ''confirmado'' where id = %L', t), t::text);
  if msg is null or msg not like '%A4P-CENTRAL-PERMISSAO%' then
    raise exception 'CASO 9 FALHOU: a marca confirmou um título a PAGAR sem pessoa (veio: %).', coalesce(msg, 'aceito');
  end if;
  -- Com sessão de pessoa (o leitor), a marca não vale: a máquina pede o papel.
  t := pg_temp.titulo();
  perform set_config('a4p.liquidacao_titulo', t::text, true);
  perform pg_temp.como(current_setting('guarda.ul')::uuid);
  begin
    update public.movements set situacao = 'confirmado' where id = t;
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  perform set_config('a4p.liquidacao_titulo', '', true);
  if msg is null or msg not like '%A4P-CENTRAL-PERMISSAO%' then
    raise exception 'CASO 9 FALHOU: uma SESSÃO de leitor com a marca confirmou o título (veio: %).', coalesce(msg, 'aceito');
  end if;

  -- 10. o aviso da Pinbank acha a cobrança (Pix.CreditoRecebido, Boleto.Liquidacao)
  cod := current_setting('guarda.codigo')::bigint;
  t := pg_temp.titulo();
  pix := pg_temp.emitir_com(t, 'pix', 'tx-aviso-' || t, '7001');
  bol := pg_temp.emitir_com(t, 'boleto', null, '00012345', repeat('5', 44));
  select nsu_origem into nsu from public.pinbank_cobrancas where id = pix;
  r := pg_temp.achar('pix', cod, nsu, null, null, null);
  if r->>'achado' <> 'uma' or (r->>'cobranca')::uuid <> pix then
    raise exception 'CASO 10 FALHOU: o NsuSistemaOrigem do aviso não achou o Pix (veio: %).', r;
  end if;
  r := pg_temp.achar('pix', cod, null, 'tx-aviso-' || t, null, null);
  if r->>'achado' <> 'uma' or (r->>'cobranca')::uuid <> pix then
    raise exception 'CASO 10 FALHOU: o TxId do aviso não achou o Pix (veio: %).', r;
  end if;
  r := pg_temp.achar('boleto', cod, null, null, '12345', null);
  if r->>'achado' <> 'uma' or (r->>'cobranca')::uuid <> bol then
    raise exception 'CASO 10 FALHOU: o nosso número sem os zeros da frente não achou o boleto (veio: %).', r;
  end if;
  r := pg_temp.achar('boleto', cod, null, null, null, repeat('5', 44));
  if r->>'achado' <> 'uma' or (r->>'cobranca')::uuid <> bol then
    raise exception 'CASO 10 FALHOU: o código de barras do aviso não achou o boleto (veio: %).', r;
  end if;
  r := pg_temp.achar('pix', cod + 1, nsu, null, null, null);
  if r->>'achado' <> 'nenhuma' then
    raise exception 'CASO 10 FALHOU: o aviso de OUTRA conta Pinbank achou a cobrança desta (veio: %).', r;
  end if;
  r := pg_temp.achar('boleto', cod, null, null, '7001', null);
  if r->>'achado' <> 'nenhuma' then
    raise exception 'CASO 10 FALHOU: o aviso de boleto achou um Pix (veio: %).', r;
  end if;
  -- O NSU de um Pix e o TxId de outro: nenhum é baixado.
  t2 := pg_temp.titulo();
  pix2 := pg_temp.emitir_com(t2, 'pix', 'tx-aviso-' || t2, '7002');
  r := pg_temp.achar('pix', cod, nsu, 'tx-aviso-' || t2, null, null);
  if r->>'achado' <> 'varias' or r ? 'cobranca' then
    raise exception 'CASO 10 FALHOU: chaves de duas cobranças devolveram uma para baixar (veio: %).', r;
  end if;
  msg := pg_temp.erro_como(ua, format('select public.pinbank_cobranca_do_aviso(''pix'', %s, %s, null, null, null)', cod, nsu));
  if msg is null then
    raise exception 'CASO 10 FALHOU: uma SESSÃO de cliente consultou o aviso.';
  end if;
  -- E o caminho inteiro: achado pelo aviso, baixado pelo escritor único.
  r := pg_temp.liquidar((pg_temp.achar('pix', cod, nsu, null, null, null)->>'cobranca')::uuid, 250.40, 'aviso-10');
  if r->>'titulo' is distinct from 'recebido' then
    raise exception 'CASO 10 FALHOU: o Pix achado pelo aviso não baixou o título (veio: %).', r;
  end if;
end $$;
grant execute on all functions in schema pg_temp to authenticated, service_role, anon;

------------------------------------------------------- os casos, em ordem ---
savepoint caso;
select pg_temp.prova_liquidacao();
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
    perform pg_temp.prova_liquidacao();
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
create or replace function pg_temp.plantar_liq(p_de text, p_para text) returns void language sql as $$
  select pg_temp.plantar('public.pinbank_cobranca_liquidar(uuid, numeric, timestamptz, text, text)'::regprocedure, p_de, p_para)
$$;
create or replace function pg_temp.plantar_maq(p_de text, p_para text) returns void language sql as $$
  select pg_temp.plantar('public.central_maquina()'::regprocedure, p_de, p_para)
$$;
create or replace function pg_temp.plantar_ler(p_de text, p_para text) returns void language sql as $$
  select pg_temp.plantar('public.pinbank_checkout_ler(text)'::regprocedure, p_de, p_para)
$$;
grant execute on all functions in schema pg_temp to authenticated, service_role, anon;

-- d1 · a cobrança paga sem baixar o título (a etapa que este PR existe para fazer)
savepoint caso;
do $d1$ begin
  perform pg_temp.plantar_liq('if m.situacao = ''previsto'' then
        update public.movements set situacao = ''confirmado'' where id = m.id;
      end if;', 'raise exception ''sem baixa'';');
  perform pg_temp.reprova('%CASO 1 FALHOU%não foi recebido%', 'o Pix pago e o título em aberto');
end $d1$;
rollback to savepoint caso;

-- d2 · a data da baixa em UTC (o caixa do dia errado)
savepoint caso;
do $d2$ begin
  perform pg_temp.plantar_liq('paid_date = (p_pago_em at time zone ''America/Sao_Paulo'')::date', 'paid_date = (p_pago_em at time zone ''UTC'')::date');
  perform pg_temp.reprova('%CASO 1 FALHOU%data de pagamento%', 'a baixa no dia seguinte em UTC');
end $d2$;
rollback to savepoint caso;

-- d3 · o mesmo aviso baixando duas vezes (sem a idempotência)
savepoint caso;
do $d3$ begin
  perform pg_temp.plantar_liq('if c.situacao = ''paga'' then', 'if false then');
  perform pg_temp.reprova('%CASO 3 FALHOU%MESMO aviso de novo foi recusado%', 'o aviso repetido');
end $d3$;
rollback to savepoint caso;

-- d4 · a sessão do cliente liquidando
savepoint caso;
do $d4$ begin
  grant execute on function public.pinbank_cobranca_liquidar(uuid, numeric, timestamptz, text, text) to authenticated;
  perform pg_temp.reprova('%CASO 4 FALHOU%SESSÃO de cliente liquidou%', 'a empresa marcando a própria cobrança como paga');
end $d4$;
rollback to savepoint caso;

-- d5 · o título cancelado sem o aviso de devolver (a máquina já recusa a volta;
--      sem a regra, a empresa leria só "o banco recusou")
savepoint caso;
do $d5$ begin
  perform pg_temp.plantar_liq('elsif m.excluido_em is not null or m.situacao not in (''previsto'', ''confirmado'') then', 'elsif false then');
  perform pg_temp.reprova('%CASO 5 FALHOU%motivo não diz%', 'o pagamento do título cancelado sem o aviso de devolver');
end $d5$;
rollback to savepoint caso;

-- d6 · a fatura de quem pagou o título cancelado dizendo "indisponível"
savepoint caso;
do $d6$ begin
  perform pg_temp.plantar_ler('when exists (select 1 from public.pinbank_cobrancas c where c.movement_id = m.id and c.situacao = ''paga'') then ''pago''', 'when false then ''pago''');
  perform pg_temp.reprova('%CASO 5 FALHOU%quem pagou leu%', 'a fatura paga lendo indisponível');
end $d6$;
rollback to savepoint caso;

-- d7 · baixa pelo valor menor
savepoint caso;
do $d7$ begin
  perform pg_temp.plantar_liq('elsif round(p_valor, 2) < c.valor then', 'elsif false then');
  perform pg_temp.reprova('%CASO 6 FALHOU%MENOR%', 'a baixa com valor menor');
end $d7$;
rollback to savepoint caso;

-- d8 · baixa pela cobrança do valor antigo
savepoint caso;
do $d8$ begin
  perform pg_temp.plantar_liq('elsif c.situacao = ''a_cancelar'' then', 'elsif false then');
  perform pg_temp.reprova('%CASO 7 FALHOU%MUDADO%', 'a baixa do título mudado');
end $d8$;
rollback to savepoint caso;

-- d9 · a marca sem conferir o título
savepoint caso;
do $d9$ begin
  perform pg_temp.plantar_maq('and coalesce(current_setting(''a4p.liquidacao_titulo'', true), '''') = new.id::text', 'and coalesce(current_setting(''a4p.liquidacao_titulo'', true), '''') <> ''''');
  perform pg_temp.reprova('%CASO 9 FALHOU%OUTRO título%', 'a marca de um título abrindo qualquer outro');
end $d9$;
rollback to savepoint caso;

-- d10 · a marca valendo para título a pagar
savepoint caso;
do $d10$ begin
  perform pg_temp.plantar_maq('and new.type = ''entrada''', '');
  perform pg_temp.reprova('%CASO 9 FALHOU%a PAGAR%', 'o servidor confirmando título a pagar sem pessoa');
end $d10$;
rollback to savepoint caso;

-- d11 · a marca valendo com sessão de pessoa
savepoint caso;
do $d11$ begin
  perform pg_temp.plantar_maq('v_pelo_banco := auth.uid() is null
    and', 'v_pelo_banco :=');
  perform pg_temp.reprova('%CASO 9 FALHOU%SESSÃO de leitor%', 'a marca abrindo a confirmação para uma pessoa');
end $d11$;
rollback to savepoint caso;

-- d12 · o boleto do título pago por Pix seguindo pagável
savepoint caso;
do $d12$ begin
  drop trigger pinbank_cobranca_titulo_mudou on public.movements;
  perform pg_temp.reprova('%CASO 1 FALHOU%boleto do título pago por Pix%', 'o boleto pagável depois do Pix');
end $d12$;
rollback to savepoint caso;

create or replace function pg_temp.plantar_aviso(p_de text, p_para text) returns void language sql as $$
  select pg_temp.plantar('public.pinbank_cobranca_do_aviso(text, bigint, bigint, text, text, text)'::regprocedure, p_de, p_para)
$$;
grant execute on all functions in schema pg_temp to authenticated, service_role, anon;

-- d13 · o aviso de outra conta Pinbank baixando título daqui
savepoint caso;
do $d13$ begin
  perform pg_temp.plantar_aviso('and c.codigo_cliente = p_codigo_cliente', '');
  perform pg_temp.reprova('%CASO 10 FALHOU%OUTRA conta%', 'o aviso sem conferir a conta');
end $d13$;
rollback to savepoint caso;

-- d14 · duas cobranças achadas e a primeira baixada
savepoint caso;
do $d14$ begin
  perform pg_temp.plantar_aviso('if cardinality(v_ids) > 1 then', 'if false then');
  perform pg_temp.reprova('%CASO 10 FALHOU%duas cobranças%', 'a chave ambígua escolhendo uma');
end $d14$;
rollback to savepoint caso;

-- d15 · o nosso número com zeros comparado como texto
savepoint caso;
do $d15$ begin
  perform pg_temp.plantar_aviso('(v_pid is not null and ltrim(c.pinbank_id, ''0'') = v_pid)
          or (v_barras', '(v_pid is not null and c.pinbank_id = v_pid)
          or (v_barras');
  perform pg_temp.reprova('%CASO 10 FALHOU%zeros da frente%', 'o nosso número sem normalizar');
end $d15$;
rollback to savepoint caso;

-- d16 · a sessão do cliente consultando o aviso
savepoint caso;
do $d16$ begin
  grant execute on function public.pinbank_cobranca_do_aviso(text, bigint, bigint, text, text, text) to authenticated;
  perform pg_temp.reprova('%CASO 10 FALHOU%SESSÃO de cliente consultou%', 'a empresa consultando avisos');
end $d16$;
rollback to savepoint caso;

do $fim$ begin raise notice 'pinbank-liquidacao: 10 casos · 16 defeitos plantados pegos · a liquidação e o aviso conferem'; end $fim$;

rollback;
