-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA DO CHECKOUT PIX/BOLETO — o link público de pagamento
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/pinbank-checkout.sql
--
-- Prova a migration 20261022120000 (sobre a 20261020120000) e a leitura da
-- régua (20261028160000, casos R1–R4 no fim):
--
--   1. sem Pix nem boleto EMITIDO, não nasce link (o cliente cairia numa página
--      sem como pagar);
--   2. o link é um token de 64 hexadecimais, um VIVO por título (o segundo
--      pedido devolve o mesmo);
--   3. o leitor não cria link, e a empresa B não cria link de título da A;
--   4. a leitura pública só roda como o SERVIDOR (visitante e sessão de
--      cliente levam "permission denied") e devolve SÓ o mínimo do pagamento:
--      a empresa que cobra pela lista de permitidos do cadastro dela
--      (20261029150000 — nada de logo, faturamento ou representante) e, do
--      pagador, SÓ o nome — nada do contato, do documento nem do endereço;
--   5. token desconhecido, mal formado ou revogado não abre nada;
--   6. o título mudou depois da emissão (cobrança `a_cancelar`): o link deixa
--      de mostrar o Pix velho;
--   7. o título recebido aparece como pago, sem o Pix;
--   8. ninguém escreve no link direto, e a criação deixa trilha.
--
-- E os DEFEITOS PLANTADOS no fim, lendo a mensagem (arreio copiado de
-- `pinbank-cobranca.sql`). Tudo termina em ROLLBACK.
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

-- ═══ A PROVA ═══
create or replace function pg_temp.prova_checkout() returns void language plpgsql as $$
declare
  ua uuid := current_setting('guarda.ua')::uuid;
  ul uuid := current_setting('guarda.ul')::uuid;
  ub uuid := current_setting('guarda.ub')::uuid;
  v uuid; t uuid; t2 uuid; tk text; tk2 text; r jsonb; msg text; k text; c jsonb;
begin
  v := pg_temp.vincular(true);
  perform pg_temp.ligar(v);
  t := pg_temp.titulo();

  -- 1. sem cobrança emitida, sem link
  msg := pg_temp.erro_como(ua, format('select public.pinbank_checkout_link_criar(%L)', t));
  if msg is null or msg not like '%gere o Pix ou o boleto%' then
    raise exception 'CASO 1 FALHOU: nasceu link SEM cobrança emitida (veio: %).', coalesce(msg, 'aceito');
  end if;

  -- 2. o token, e um vivo por título
  perform pg_temp.emitir_pix(t);
  tk := pg_temp.criar(ua, t);
  if tk is null or tk !~ '^[0-9a-f]{64}$' then
    raise exception 'CASO 2 FALHOU: o token não tem 64 hexadecimais (veio: %).', coalesce(tk, 'nulo');
  end if;
  tk2 := pg_temp.criar(ua, t);
  if tk2 is distinct from tk then
    raise exception 'CASO 2 FALHOU: o segundo pedido criou OUTRO link para o mesmo título.';
  end if;

  -- 3. o leitor e a empresa B
  msg := pg_temp.erro_como(ul, format('select public.pinbank_checkout_link_criar(%L)', t));
  if msg is null or msg not like '%não pode criar link%' then
    raise exception 'CASO 3 FALHOU: o LEITOR criou link de pagamento (veio: %).', coalesce(msg, 'aceito');
  end if;
  msg := pg_temp.erro_como(ub, format('select public.pinbank_checkout_link_criar(%L)', t));
  if msg is null or msg not like '%não encontrado na empresa aberta%' then
    raise exception 'CASO 3 FALHOU: a empresa B criou link de título da A (veio: %).', coalesce(msg, 'aceito');
  end if;

  -- 4. a leitura pública: só o servidor, só o mínimo
  begin
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    set local role anon;
    perform public.pinbank_checkout_ler(tk);
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  if msg is null or msg not like '%permission denied%' then
    raise exception 'CASO 4 FALHOU: o VISITANTE leu o link direto pela API (veio: %).', coalesce(msg, 'aceito');
  end if;
  msg := pg_temp.erro_como(ub, format('select public.pinbank_checkout_ler(%L)', tk));
  if msg is null or msg not like '%permission denied%' then
    raise exception 'CASO 4 FALHOU: uma SESSÃO de cliente leu o link direto (veio: %).', coalesce(msg, 'aceito');
  end if;
  r := pg_temp.ler(tk);
  if r->>'situacao' <> 'aberto' or (r->>'valor')::numeric <> 250.40 or jsonb_array_length(r->'cobrancas') <> 1
     or r->'cobrancas'->0->>'textoQrCode' is null then
    raise exception 'CASO 4 FALHOU: o link aberto não mostrou o Pix do título (veio: %).', r;
  end if;
  for k in select jsonb_object_keys(r) loop
    if k not in ('situacao','empresa','credor','comprador','descricao','valor','vencimento','cobrancas') then
      raise exception 'CASO 4 FALHOU: o link público EXPÕE o campo "%".', k;
    end if;
  end loop;
  -- A empresa que cobra: o cabeçalho da fatura, só das chaves permitidas.
  if r->'credor'->>'razaoSocial' is distinct from 'Padaria da Guarda Ltda' or r->'credor'->>'cnpj' is null
     or r->'credor'->>'email' is distinct from 'financeiro@guarda.local' then
    raise exception 'CASO 4 FALHOU: a fatura não mostrou a empresa que cobra (veio: %).', r->'credor';
  end if;
  for k in select jsonb_object_keys(r->'credor') loop
    if k not in ('fantasia','razaoSocial','cnpj','cpf','email','telefone','whatsapp','ddi',
                 'rua','numero','complemento','bairro','cidade','estado','cep') then
      raise exception 'CASO 4 FALHOU: o link público EXPÕE o campo "%" do cadastro da empresa.', k;
    end if;
  end loop;
  -- Do pagador, SÓ o nome.
  if r->'comprador'->>'nome' is distinct from 'Cliente da cobrança' then
    raise exception 'CASO 4 FALHOU: a fatura não mostrou o nome do cliente (veio: %).', r->'comprador';
  end if;
  for k in select jsonb_object_keys(r->'comprador') loop
    if k <> 'nome' then
      raise exception 'CASO 4 FALHOU: o link público EXPÕE o campo "%" do pagador.', k;
    end if;
  end loop;
  if r::text like '%cliente@guarda.local%' or r::text like '%11.222.333%' or r::text like '%Paulista%' then
    raise exception 'CASO 4 FALHOU: o link público EXPÕE o contato, o documento ou o endereço do PAGADOR (veio: %).', r;
  end if;
  for c in select jsonb_array_elements(r->'cobrancas') loop
    for k in select jsonb_object_keys(c) loop
      if k not in ('tipo','valor','vencimento','textoQrCode','linhaDigitavel') then
        raise exception 'CASO 4 FALHOU: o link público EXPÕE o campo "%" da cobrança.', k;
      end if;
    end loop;
  end loop;

  -- 5. token que não abre
  if pg_temp.ler(repeat('0', 64)) is not null or pg_temp.ler('abc') is not null or pg_temp.ler(null) is not null then
    raise exception 'CASO 5 FALHOU: um token desconhecido ou mal formado abriu algo.';
  end if;

  -- 8. ninguém escreve direto; a trilha registrou
  msg := pg_temp.erro_como(ua, format(
    'insert into public.pinbank_checkout_links (org_id, movement_id, token) values (%L, %L, %L)',
    current_setting('guarda.oa'), t, repeat('a', 64)));
  if msg is null or msg not like '%permission denied%' then
    raise exception 'CASO 8 FALHOU: a sessão do cliente INSERIU link direto (veio: %).', coalesce(msg, 'aceito');
  end if;
  if not exists (select 1 from public.audit_log where entidade = 'pinbank_checkout_links') then
    raise exception 'CASO 8 FALHOU: a criação do link não deixou trilha.';
  end if;

  -- 6. o título muda: o Pix velho sai do link
  update public.movements set amount = 300 where id = t;
  r := pg_temp.ler(tk);
  if r->>'situacao' <> 'indisponivel' or jsonb_array_length(r->'cobrancas') <> 0 then
    raise exception 'CASO 6 FALHOU: o link seguiu mostrando o Pix do valor ANTIGO (veio: %).', r;
  end if;

  -- 7. recebido = pago, sem o Pix
  t2 := pg_temp.titulo();
  perform pg_temp.emitir_pix(t2);
  tk2 := pg_temp.criar(ua, t2);
  update public.movements set situacao = 'confirmado' where id = t2;
  update public.movements set situacao = 'baixado', paid_date = current_date where id = t2;
  r := pg_temp.ler(tk2);
  if r->>'situacao' <> 'pago' or jsonb_array_length(r->'cobrancas') <> 0 then
    raise exception 'CASO 7 FALHOU: o título recebido não apareceu como pago (veio: %).', r;
  end if;
  if r->'comprador' is not null and jsonb_typeof(r->'comprador') <> 'null' then
    raise exception 'CASO 7 FALHOU: o link do título recebido seguiu mostrando o nome do cliente (veio: %).', r->'comprador';
  end if;

  -- 5b. o link revogado não abre
  update public.pinbank_checkout_links set revogado_em = now() where token = tk2;
  if pg_temp.ler(tk2) is not null then
    raise exception 'CASO 5 FALHOU: o link REVOGADO ainda abriu.';
  end if;
end $$;
grant execute on all functions in schema pg_temp to authenticated, service_role, anon;

------------------------------------------------------- os casos, em ordem ---
savepoint caso;
select pg_temp.prova_checkout();
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
    perform pg_temp.prova_checkout();
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
create or replace function pg_temp.plantar_criar(p_de text, p_para text) returns void language sql as $$
  select pg_temp.plantar('public.pinbank_checkout_link_criar(uuid)'::regprocedure, p_de, p_para)
$$;
create or replace function pg_temp.plantar_ler(p_de text, p_para text) returns void language sql as $$
  select pg_temp.plantar('public.pinbank_checkout_ler(text)'::regprocedure, p_de, p_para)
$$;
grant execute on all functions in schema pg_temp to authenticated, service_role, anon;

-- d1 · link sem cobrança emitida
savepoint caso;
do $d1$ begin
  perform pg_temp.plantar_criar('if not exists (', 'if false and not exists (');
  perform pg_temp.reprova('%CASO 1 FALHOU%SEM cobrança emitida%', 'o link para uma página sem como pagar');
end $d1$;
rollback to savepoint caso;

-- d2 · dois links vivos para o mesmo título
savepoint caso;
do $d2$ begin
  drop index public.pinbank_checkout_links_vivo_unico;
  perform pg_temp.plantar_criar('if found then
    return v_token;', 'if false then
    return v_token;');
  perform pg_temp.reprova('%CASO 2 FALHOU%OUTRO link%', 'um link novo a cada envio');
end $d2$;
rollback to savepoint caso;

-- d3 · o leitor criando link
savepoint caso;
do $d3$ begin
  perform pg_temp.plantar_criar('if not public.tem_permissao(''lancar'', m.org_id) then', 'if false then');
  perform pg_temp.reprova('%CASO 3 FALHOU%LEITOR criou%', 'o leitor criando link');
end $d3$;
rollback to savepoint caso;

-- d4 · sem conferir a empresa aberta
savepoint caso;
do $d4$ begin
  perform pg_temp.plantar_criar('if not found or m.org_id is distinct from public.auth_org_id() then', 'if not found then');
  perform pg_temp.plantar_criar('if not public.tem_permissao(''lancar'', m.org_id) then', 'if not public.tem_permissao(''lancar'', public.auth_org_id()) then');
  perform pg_temp.reprova('%CASO 3 FALHOU%empresa B criou%', 'a empresa B criando link do título da A');
end $d4$;
rollback to savepoint caso;

-- d5 · a leitura aberta ao visitante
savepoint caso;
do $d5$ begin
  grant execute on function public.pinbank_checkout_ler(text) to anon;
  perform pg_temp.reprova('%CASO 4 FALHOU%VISITANTE leu%', 'a API pública lendo o link sem a página');
end $d5$;
rollback to savepoint caso;

-- d6 · o link expondo dado da cobrança além do mínimo
savepoint caso;
do $d6$ begin
  perform pg_temp.plantar_ler('''linhaDigitavel'', c.linha_digitavel', '''linhaDigitavel'', c.linha_digitavel, ''codigoCliente'', c.codigo_cliente');
  perform pg_temp.reprova('%CASO 4 FALHOU%EXPÕE o campo "codigoCliente"%', 'o código da conta no link público');
end $d6$;
rollback to savepoint caso;

-- d7 · o revogado continua abrindo
savepoint caso;
do $d7$ begin
  perform pg_temp.plantar_ler('where token = p_token and revogado_em is null', 'where token = p_token');
  perform pg_temp.reprova('%CASO 5 FALHOU%REVOGADO%', 'o link revogado abrindo');
end $d7$;
rollback to savepoint caso;

-- d8 · o Pix a cancelar continuando no link
savepoint caso;
do $d8$ begin
  perform pg_temp.plantar_ler('where c.movement_id = m.id and c.situacao = ''emitida''', 'where c.movement_id = m.id and c.situacao in (''emitida'',''a_cancelar'')');
  perform pg_temp.reprova('%CASO 6 FALHOU%valor ANTIGO%', 'o Pix do valor antigo no link');
end $d8$;
rollback to savepoint caso;

-- d9 · título recebido seguindo como aberto
savepoint caso;
do $d9$ begin
  perform pg_temp.plantar_ler('when m.situacao in (''baixado'',''conciliado'') then ''pago''', 'when false then ''pago''');
  perform pg_temp.plantar_ler('or m.situacao not in (''previsto'',''confirmado'')', 'or false');
  perform pg_temp.reprova('%CASO 7 FALHOU%pago%', 'o cliente pagando de novo o título recebido');
end $d9$;
rollback to savepoint caso;

-- d9b · o cadastro inteiro da empresa no link (logo, faturamento, representante)
savepoint caso;
do $d9b$ begin
  perform pg_temp.plantar_ler('v_credor := v_credor || jsonb_build_object(k, left(btrim(v_db ->> k), 120));', 'v_credor := v_db;');
  perform pg_temp.reprova('%CASO 4 FALHOU%EXPÕE o campo%do cadastro da empresa%', 'o cadastro inteiro da empresa no link público');
end $d9b$;
rollback to savepoint caso;

-- d9c · o contato do pagador no link
savepoint caso;
do $d9c$ begin
  perform pg_temp.plantar_ler('jsonb_build_object(''nome'', v_comprador)', 'jsonb_build_object(''nome'', v_comprador, ''email'', (select p.email from public.parties p where p.id = m.party_id))');
  perform pg_temp.reprova('%CASO 4 FALHOU%EXPÕE o campo "email" do pagador%', 'o e-mail do pagador no link público');
end $d9c$;
rollback to savepoint caso;

-- ═══ A RÉGUA LÊ OS LINKS (migration 20261028160000) ═══
-- `regua_links_de_pagamento`: só o servidor; só o link vivo de título a
-- receber em aberto com cobrança emitida; só da empresa e dos títulos pedidos.
create or replace function pg_temp.links_regua(p_org uuid, p_movs uuid[]) returns setof text language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role service_role;
  return query select r.movement_id::text || ':' || r.token from public.regua_links_de_pagamento(p_org, p_movs) r;
  reset role;
end $$;
grant execute on all functions in schema pg_temp to authenticated, service_role, anon;

create or replace function pg_temp.prova_regua() returns void language plpgsql as $$
declare
  ua uuid := current_setting('guarda.ua')::uuid;
  ub uuid := current_setting('guarda.ub')::uuid;
  oa uuid := current_setting('guarda.oa')::uuid;
  ob uuid := current_setting('guarda.ob')::uuid;
  v uuid; t uuid; t2 uuid; t3 uuid; tk text; tk2 text; msg text; got text[];
begin
  v := pg_temp.vincular(true);
  perform pg_temp.ligar(v);
  t := pg_temp.titulo();  perform pg_temp.emitir_pix(t);  tk := pg_temp.criar(ua, t);
  t2 := pg_temp.titulo(); perform pg_temp.emitir_pix(t2); tk2 := pg_temp.criar(ua, t2);
  t3 := pg_temp.titulo();  -- sem cobrança: sem link

  -- R1. o servidor lê o link do título pedido, e só dele
  got := array(select pg_temp.links_regua(oa, array[t, t3]));
  if got is distinct from array[t::text || ':' || tk] then
    raise exception 'REGUA R1 FALHOU: a régua não recebeu SÓ o link do título pedido (veio: %).', got;
  end if;

  -- R2. a empresa errada não devolve o link
  if exists (select pg_temp.links_regua(ob, array[t, t2])) then
    raise exception 'REGUA R2 FALHOU: pedindo pela empresa B, voltou link de título da A.';
  end if;

  -- R3. só o servidor executa
  msg := pg_temp.erro_como(ua, format('select * from public.regua_links_de_pagamento(%L, array[%L]::uuid[])', oa, t));
  if msg is null or msg not like '%permission denied%' then
    raise exception 'REGUA R3 FALHOU: uma SESSÃO de cliente leu os links da régua (veio: %).', coalesce(msg, 'aceito');
  end if;

  -- R4. título mudou (cobrança a cancelar) e título recebido saem
  update public.movements set amount = 300 where id = t;
  update public.movements set situacao = 'confirmado' where id = t2;
  update public.movements set situacao = 'baixado', paid_date = current_date where id = t2;
  if exists (select pg_temp.links_regua(oa, array[t, t2])) then
    raise exception 'REGUA R4 FALHOU: a régua mandaria link de título mudado ou já recebido.';
  end if;
end $$;
grant execute on all functions in schema pg_temp to authenticated, service_role, anon;

savepoint caso;
select pg_temp.prova_regua();
rollback to savepoint caso;

create or replace function pg_temp.reprova_regua(p_espera text, p_defeito text) returns void language plpgsql as $$
declare msg text;
begin
  begin
    perform pg_temp.prova_regua();
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  if msg is null then
    raise exception 'DEFEITO PLANTADO NÃO FOI PEGO: "%" — a prova da régua passou.', p_defeito;
  end if;
  if msg not like p_espera then
    raise exception 'VERMELHO PELO MOTIVO ERRADO ("%"): esperado %, veio "%"', p_defeito, p_espera, msg;
  end if;
end $$;
create or replace function pg_temp.plantar_regua(p_de text, p_para text) returns void language sql as $$
  select pg_temp.plantar('public.regua_links_de_pagamento(uuid,uuid[])'::regprocedure, p_de, p_para)
$$;
grant execute on all functions in schema pg_temp to authenticated, service_role, anon;

-- d10 · sem filtrar os títulos pedidos
savepoint caso;
do $d10$ begin
  perform pg_temp.plantar_regua('and l.movement_id = any (coalesce(p_movements, ''{}''::uuid[]))', '');
  perform pg_temp.reprova_regua('%REGUA R1 FALHOU%', 'a régua recebendo links de títulos que não pediu');
end $d10$;
rollback to savepoint caso;

-- d11 · sem conferir a empresa
savepoint caso;
do $d11$ begin
  perform pg_temp.plantar_regua('where l.org_id = p_org
     and m.org_id = p_org', 'where true');
  perform pg_temp.reprova_regua('%REGUA R2 FALHOU%', 'o link de outra empresa voltando');
end $d11$;
rollback to savepoint caso;

-- d12 · aberta à sessão do cliente
savepoint caso;
do $d12$ begin
  grant execute on function public.regua_links_de_pagamento(uuid, uuid[]) to authenticated;
  perform pg_temp.reprova_regua('%REGUA R3 FALHOU%', 'a sessão lendo os links pela API');
end $d12$;
rollback to savepoint caso;

-- d13 · o link de título mudado ou recebido seguindo na mensagem
savepoint caso;
do $d13$ begin
  perform pg_temp.plantar_regua('and m.situacao in (''previsto'',''confirmado'')', '');
  perform pg_temp.plantar_regua('where c.movement_id = m.id and c.situacao = ''emitida''', 'where c.movement_id = m.id');
  perform pg_temp.reprova_regua('%REGUA R4 FALHOU%', 'o cliente recebendo link de título pago ou com Pix velho');
end $d13$;
rollback to savepoint caso;

do $fim$ begin raise notice 'pinbank-checkout: 12 casos · 15 defeitos plantados pegos · o link e a régua conferem'; end $fim$;

rollback;
