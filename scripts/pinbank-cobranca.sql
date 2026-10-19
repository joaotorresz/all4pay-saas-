-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA DA COBRANÇA PIX/BOLETO PELA CONTA PINBANK — a fechadura no banco
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/pinbank-cobranca.sql
--
-- Prova a migration 20261020120000:
--
--   1. a EMPRESA não liga a cobrança sem o código que só a PLATAFORMA digita,
--      nem com a maquininha desativada, e o LEITOR não liga nada;
--   2. sem a cobrança ligada, nada se reserva;
--   3. a reserva lê valor, vencimento e código do TÍTULO e do VÍNCULO (nunca
--      do pedido), e o leitor não reserva;
--   4. só título A RECEBER, vivo, em aberto, que não seja transferência;
--   5. o segundo clique: reservada recusa, emitida devolve a MESMA;
--   6. só o SERVIDOR registra o resultado, só a partir de `reservada`, e o
--      registro não se reescreve;
--   7. `incerta` segura o título: nenhuma segunda emissão;
--   8. o título mudou depois de emitida → `a_cancelar`, e nova emissão recusada;
--   9. a empresa B não vê nem reserva nada da A; ninguém escreve direto.
--
-- E os DEFEITOS PLANTADOS no fim: cada um reescreve uma função da migration
-- num savepoint e exige que a prova REPROVE, lendo a mensagem. Planta que não
-- acha mais o trecho "envelheceu" — e isso também reprova. O arreio é o de
-- `pinbank.sql`, copiado. Tudo termina em ROLLBACK.
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
    (ua, 'pbc-a@guarda.local'), (ul, 'pbc-leitor@guarda.local'),
    (ub, 'pbc-b@guarda.local'), (up, 'pbc-plataforma@guarda.local');
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
  values ('pbc-plataforma@guarda.local', 'guarda da cobrança Pinbank (desfeita no fim)')
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

grant execute on all functions in schema pg_temp to authenticated, service_role;

-- ═══ A PROVA — todos os casos numa função, para os defeitos plantados ═══
create or replace function pg_temp.prova_cobranca() returns void language plpgsql as $$
declare
  ua uuid := current_setting('guarda.ua')::uuid;
  ul uuid := current_setting('guarda.ul')::uuid;
  ub uuid := current_setting('guarda.ub')::uuid;
  v uuid; t uuid; t2 uuid; r jsonb; r2 jsonb; msg text; c record; n int;
begin
  -- 1. a segunda chave
  v := pg_temp.vincular(false);
  msg := pg_temp.erro_como(ua, format('select public.pinbank_cobranca_configurar(%L, true)', v));
  if msg is null or msg not like '%código da conta Pinbank%plataforma%' then
    raise exception 'CASO 1 FALHOU: a empresa ligou a cobrança SEM o código da plataforma (veio: %).', coalesce(msg, 'aceito');
  end if;
  -- a plataforma desvincula e vincula com o código (editar o EC é desvincular e vincular)
  perform pg_temp.como(current_setting('guarda.up')::uuid);
  set local role authenticated;
  perform public.admin_pinbank_desvincular(v, 'guarda: vincular de novo com o código');
  reset role;
  v := pg_temp.vincular(true);
  msg := pg_temp.erro_como(ul, format('select public.pinbank_cobranca_configurar(%L, true)', v));
  if msg is null or msg not like '%só quem administra%' then
    raise exception 'CASO 1 FALHOU: o LEITOR ligou a cobrança (veio: %).', coalesce(msg, 'aceito');
  end if;

  -- 2. sem a cobrança ligada, nada se reserva
  t := pg_temp.titulo();
  msg := pg_temp.erro_como(ua, format('select public.pinbank_cobranca_reservar(%L, ''pix'')', t));
  if msg is null or msg not like '%não está ligada%' then
    raise exception 'CASO 2 FALHOU: reservou com a cobrança desligada (veio: %).', coalesce(msg, 'aceito');
  end if;
  perform pg_temp.ligar(v);

  -- 3. a reserva lê do TÍTULO e do VÍNCULO
  msg := pg_temp.erro_como(ul, format('select public.pinbank_cobranca_reservar(%L, ''pix'')', t));
  if msg is null or msg not like '%não pode gerar cobrança%' then
    raise exception 'CASO 3 FALHOU: o LEITOR reservou uma cobrança (veio: %).', coalesce(msg, 'aceito');
  end if;
  r := pg_temp.reservar(ua, t, 'pix');
  if (r ->> 'existente')::boolean or (r ->> 'valor')::numeric <> 250.40
     or (r ->> 'codigoCliente')::bigint <> current_setting('guarda.codigo')::bigint
     or (r ->> 'vencimento')::date <> current_date + 10
     or (r -> 'devedor' ->> 'documento') <> '11222333000181' then
    raise exception 'CASO 3 FALHOU: a reserva não saiu do título e do vínculo: %', r;
  end if;
  if (r ->> 'nsuOrigem')::bigint is null then
    raise exception 'CASO 3 FALHOU: reserva sem NSU de origem: %', r;
  end if;

  -- 5. o segundo clique
  msg := pg_temp.erro_como(ua, format('select public.pinbank_cobranca_reservar(%L, ''pix'')', t));
  if msg is null or msg not like '%já está sendo gerada%' then
    raise exception 'CASO 5 FALHOU: a segunda reserva do MESMO título e tipo passou (veio: %).', coalesce(msg, 'aceito');
  end if;
  -- o boleto é outro tipo: reserva à parte
  r2 := pg_temp.reservar(ua, t, 'boleto');
  if (r2 ->> 'nsuOrigem')::bigint = (r ->> 'nsuOrigem')::bigint then
    raise exception 'CASO 5 FALHOU: duas cobranças com o mesmo NSU de origem.';
  end if;

  -- 6. só o servidor registra
  msg := pg_temp.erro_como(ua, format(
    'select public.pinbank_cobranca_registrar(%L, ''{"situacao":"emitida","textoQrCode":"000201falso"}''::jsonb)', r ->> 'id'));
  if msg is null or msg not like '%permission denied%' then
    raise exception 'CASO 6 FALHOU: a SESSÃO DO CLIENTE gravou o QR da cobrança (veio: %).', coalesce(msg, 'aceito');
  end if;
  perform pg_temp.registrar((r ->> 'id')::uuid, '{"situacao":"emitida","textoQrCode":"00020126580014br.gov.bcb.pix","txid":"TX1","pinbankId":"99"}'::jsonb);
  select * into c from public.pinbank_cobrancas where id = (r ->> 'id')::uuid;
  if c.situacao <> 'emitida' or c.texto_qrcode is null or c.emitida_em is null then
    raise exception 'CASO 6 FALHOU: o registro do servidor não gravou a emissão: %', row_to_json(c);
  end if;
  begin
    perform pg_temp.registrar((r ->> 'id')::uuid, '{"situacao":"emitida","textoQrCode":"000201outro"}'::jsonb);
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  if msg is null or msg not like '%não se reescreve%' then
    raise exception 'CASO 6 FALHOU: o resultado registrado foi REESCRITO (veio: %).', coalesce(msg, 'aceito');
  end if;
  -- emitida: o segundo clique devolve a MESMA
  r := pg_temp.reservar(ua, t, 'pix');
  if not (r ->> 'existente')::boolean or (r ->> 'id')::uuid <> c.id then
    raise exception 'CASO 5 FALHOU: com a cobrança emitida, o segundo clique não devolveu a mesma: %', r;
  end if;
  -- boleto emitido sem linha digitável é recusado pelo banco
  begin
    perform pg_temp.registrar((r2 ->> 'id')::uuid, '{"situacao":"emitida"}'::jsonb);
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  if msg is null or msg not like '%pinbank_cobranca_emitida_tem_dado%' then
    raise exception 'CASO 6 FALHOU: boleto "emitido" sem linha digitável aceito (veio: %).', coalesce(msg, 'aceito');
  end if;

  -- 7. incerta segura o título
  perform pg_temp.registrar((r2 ->> 'id')::uuid, '{"situacao":"incerta","motivo":"a resposta não chegou"}'::jsonb);
  msg := pg_temp.erro_como(ua, format('select public.pinbank_cobranca_reservar(%L, ''boleto'')', t));
  if msg is null or msg not like '%não confirmou a cobrança anterior%' then
    raise exception 'CASO 7 FALHOU: com a cobrança INCERTA, uma segunda emissão passou (veio: %).', coalesce(msg, 'aceito');
  end if;

  -- 8. o título mudou → a_cancelar
  update public.movements set amount = 300 where id = t;
  select count(*) into n from public.pinbank_cobrancas where movement_id = t and situacao = 'a_cancelar';
  if n <> 2 then
    raise exception 'CASO 8 FALHOU: o título mudou de valor e % cobrança(s) foram para a_cancelar (esperado 2).', n;
  end if;
  msg := pg_temp.erro_como(ua, format('select public.pinbank_cobranca_reservar(%L, ''pix'')', t));
  if msg is null or msg not like '%precisa ser cancelada na Pinbank%' then
    raise exception 'CASO 8 FALHOU: nova emissão com a antiga ainda pagável (veio: %).', coalesce(msg, 'aceito');
  end if;

  -- 4. só título a receber, vivo, em aberto, sem transferência
  t2 := pg_temp.titulo('saida');
  msg := pg_temp.erro_como(ua, format('select public.pinbank_cobranca_reservar(%L, ''pix'')', t2));
  if msg is null or msg not like '%A RECEBER%' then
    raise exception 'CASO 4 FALHOU: cobrou um título a PAGAR (veio: %).', coalesce(msg, 'aceito');
  end if;
  t2 := pg_temp.titulo('entrada', 'Transferência entre contas');
  msg := pg_temp.erro_como(ua, format('select public.pinbank_cobranca_reservar(%L, ''pix'')', t2));
  if msg is null or msg not like '%transferência%' then
    raise exception 'CASO 4 FALHOU: cobrou uma transferência entre contas próprias (veio: %).', coalesce(msg, 'aceito');
  end if;
  t2 := pg_temp.titulo();
  update public.movements set situacao = 'confirmado' where id = t2;
  update public.movements set situacao = 'baixado', paid_date = current_date where id = t2;
  msg := pg_temp.erro_como(ua, format('select public.pinbank_cobranca_reservar(%L, ''pix'')', t2));
  if msg is null or msg not like '%já foi recebido%' then
    raise exception 'CASO 4 FALHOU: cobrou um título JÁ RECEBIDO (veio: %).', coalesce(msg, 'aceito');
  end if;

  -- 9. a empresa B
  perform pg_temp.como(ub);
  set local role authenticated;
  select count(*) into n from public.pinbank_cobrancas;
  reset role;
  if n <> 0 then
    raise exception 'CASO 9 FALHOU: a empresa B leu % cobrança(s) da A.', n;
  end if;
  t2 := pg_temp.titulo();
  msg := pg_temp.erro_como(ub, format('select public.pinbank_cobranca_reservar(%L, ''pix'')', t2));
  if msg is null or msg not like '%não encontrado na empresa aberta%' then
    raise exception 'CASO 9 FALHOU: a empresa B reservou cobrança de título da A (veio: %).', coalesce(msg, 'aceito');
  end if;
  msg := pg_temp.erro_como(ua, format(
    'insert into public.pinbank_cobrancas (org_id, vinculo_id, movement_id, tipo, valor, vencimento, codigo_cliente) values (%L, %L, %L, ''pix'', 1, current_date, 1)',
    current_setting('guarda.oa'), v, t2));
  if msg is null or msg not like '%permission denied%' then
    raise exception 'CASO 9 FALHOU: a sessão do cliente INSERIU cobrança direto (veio: %).', coalesce(msg, 'aceito');
  end if;
  msg := pg_temp.erro_como(ua, format('update public.pinbank_cobrancas set texto_qrcode = ''x'' where id = %L', c.id));
  if msg is null or msg not like '%permission denied%' then
    raise exception 'CASO 9 FALHOU: a sessão do cliente ALTEROU a cobrança direto (veio: %).', coalesce(msg, 'aceito');
  end if;
  -- a trilha registrou
  if not exists (select 1 from public.audit_log where entidade = 'pinbank_cobrancas' and entidade_id = c.id::text) then
    raise exception 'CASO 9 FALHOU: a cobrança não deixou trilha.';
  end if;
end $$;
grant execute on all functions in schema pg_temp to authenticated, service_role;

------------------------------------------------------- os casos, em ordem ---
savepoint caso;
select pg_temp.prova_cobranca();
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
    perform pg_temp.prova_cobranca();
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
  select pg_temp.plantar('public.pinbank_cobranca_reservar(uuid,text)'::regprocedure, p_de, p_para)
$$;
grant execute on all functions in schema pg_temp to authenticated, service_role;

-- d1 · o código vindo de QUALQUER vínculo, sem conferir a segunda chave
savepoint caso;
do $d1$ begin
  perform pg_temp.plantar('public.pinbank_cobranca_configurar(uuid,boolean)'::regprocedure,
    'if v.codigo_cliente is null then', 'if false then');
  perform pg_temp.plantar('public.pinbank_cobranca_configurar(uuid,boolean)'::regprocedure,
    'set cobranca_ativa = true, cobranca_ativada_por = auth.uid(), cobranca_ativada_em = now()',
    'set ativo = ativo');
  perform pg_temp.reprova('%CASO 1 FALHOU%SEM o código%', 'ligar a cobrança sem o código da plataforma');
end $d1$;
rollback to savepoint caso;

-- d2 · reservar sem o papel de lançar
savepoint caso;
do $d2$ begin
  perform pg_temp.plantar_reservar('if not public.tem_permissao(''lancar'', m.org_id) then', 'if false then');
  perform pg_temp.reprova('%CASO 3 FALHOU%LEITOR reservou%', 'o leitor reservando');
end $d2$;
rollback to savepoint caso;

-- d3 · sem o índice de uma viva: a reserva duplicada
savepoint caso;
do $d3$ begin
  drop index public.pinbank_cobrancas_viva_unica;
  perform pg_temp.plantar_reservar('raise exception ''A4P-COBRANCA: esta cobrança já está sendo gerada',
    'return jsonb_build_object(''id'', c.id); raise exception ''A4P-COBRANCA: esta cobrança já está sendo gerada');
  perform pg_temp.reprova('%CASO 5 FALHOU%segunda reserva%', 'o clique duplo emitindo duas');
end $d3$;
rollback to savepoint caso;

-- d4 · o cliente pode registrar o resultado
savepoint caso;
do $d4$ begin
  grant execute on function public.pinbank_cobranca_registrar(uuid, jsonb) to authenticated;
  perform pg_temp.reprova('%CASO 6 FALHOU%SESSÃO DO CLIENTE gravou o QR%', 'o lançador gravando um QR alheio');
end $d4$;
rollback to savepoint caso;

-- d5 · o registro reescreve o resultado
savepoint caso;
do $d5$ begin
  perform pg_temp.plantar('public.pinbank_cobranca_registrar(uuid,jsonb)'::regprocedure,
    'if c.situacao <> ''reservada'' then', 'if false then');
  perform pg_temp.reprova('%CASO 6 FALHOU%REESCRITO%', 'o QR trocado depois de emitido');
end $d5$;
rollback to savepoint caso;

-- d6 · incerta liberando a segunda emissão
savepoint caso;
do $d6$ begin
  perform pg_temp.plantar_reservar('situacao in (''reservada'',''emitida'',''incerta'',''a_cancelar'')
   limit 1', 'situacao in (''reservada'',''emitida'',''a_cancelar'')
   limit 1');
  drop index public.pinbank_cobrancas_viva_unica;
  perform pg_temp.reprova('%CASO 7 FALHOU%INCERTA%', 'a cobrança incerta tratada como falha');
end $d6$;
rollback to savepoint caso;

-- d7 · o título muda e a cobrança antiga segue emitida
savepoint caso;
do $d7$ begin
  perform pg_temp.plantar('public.pinbank_cobranca_titulo_mudou()'::regprocedure,
    'if new.amount is distinct from old.amount', 'if false and new.amount is distinct from old.amount');
  perform pg_temp.reprova('%CASO 8 FALHOU%a_cancelar%', 'o QR do valor antigo continuando na tela');
end $d7$;
rollback to savepoint caso;

-- d8 · cobrar título a pagar
savepoint caso;
do $d8$ begin
  perform pg_temp.plantar_reservar('if m.type <> ''entrada'' then', 'if false then');
  perform pg_temp.reprova('%CASO 4 FALHOU%a PAGAR%', 'a cobrança de um título a pagar');
end $d8$;
rollback to savepoint caso;

-- d9 · a empresa errada (sem conferir a empresa aberta)
savepoint caso;
do $d9$ begin
  perform pg_temp.plantar_reservar('if not found or m.org_id is distinct from public.auth_org_id() then', 'if not found then');
  perform pg_temp.plantar_reservar('if not public.tem_permissao(''lancar'', m.org_id) then', 'if not public.tem_permissao(''lancar'', public.auth_org_id()) then');
  perform pg_temp.reprova('%CASO 9 FALHOU%empresa B reservou%', 'a empresa B cobrando o cliente da A');
end $d9$;
rollback to savepoint caso;

-- d10 · o valor vindo de outro lugar que não o título
savepoint caso;
do $d10$ begin
  perform pg_temp.plantar_reservar('values (m.org_id, v.id, m.id, p_tipo, m.amount,', 'values (m.org_id, v.id, m.id, p_tipo, 1,');
  perform pg_temp.reprova('%CASO 3 FALHOU%não saiu do título%', 'o valor da cobrança diferente do título');
end $d10$;
rollback to savepoint caso;

do $fim$ begin raise notice 'pinbank-cobranca: 9 casos · 10 defeitos plantados pegos · a fechadura confere'; end $fim$;

rollback;
