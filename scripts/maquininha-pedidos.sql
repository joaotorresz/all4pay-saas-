-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA DO PEDIDO DE MAQUININHA COM A SIMULAÇÃO — migration 20261028170000.
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/maquininha-pedidos.sql
--
-- Prova, contra o banco de verdade e dentro de uma transação DESFEITA:
--   1. a chamada ANTIGA (dez parâmetros, o navegador de antes do deploy)
--      continua criando o pedido, com origem "formulario" e sem simulação;
--   2. a chamada nova grava a origem e a simulação;
--   3. o banco recusa origem inventada, simulação que não é objeto e
--      simulação grande demais;
--   4. existe UMA função maquininha_pedido_criar — com duas, o PostgREST não
--      sabe qual chamar e o pedido falha para todo mundo;
--   5. TESTE NEGATIVO: a assinatura antiga é recriada numa subtransação e a
--      asserção 4 tem de reprovar NOMEANDO as duas candidatas.
--
-- O usuário entra por `auth.users` (o gatilho de signup cria a empresa com
-- ele como titular), como em `plano-pro.sql`. Termina em ROLLBACK.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

begin;

create function pg_temp.como(u uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
end $$;

create function pg_temp.candidatas() returns int
language sql as $$
  select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'maquininha_pedido_criar'
$$;

do $guarda$
declare
  u uuid := gen_random_uuid();
  o uuid;
  id_antigo uuid; id_novo uuid;
  r record;
  falhas text[] := '{}';
  msg text;
  sim jsonb := jsonb_build_object(
    'versao', 'maquininha-oferta/1.2.0', 'volumeMensal', 30000, 'antecipado', false,
    'mix', jsonb_build_object('pix', 0.25, 'debito', 0.3, 'credito', 0.3, 'parcelado', 0.15),
    'taxasAtuais', jsonb_build_object(
      'pix', jsonb_build_object('taxa', 0.0049, 'origem', 'estimada'),
      'debito', jsonb_build_object('taxa', 0.0179, 'origem', 'informada'),
      'credito', jsonb_build_object('taxa', 0.0319, 'origem', 'estimada'),
      'parcelado', jsonb_build_object('taxa', 0.0379, 'origem', 'estimada')),
    'taxasQuattro', jsonb_build_object('pix', 0.0094, 'debito', 0.0132, 'credito', 0.0196, 'parcelado', 0.04),
    'custoAtualMes', 600, 'custoQuattroMes', 480, 'economiaMes', 120, 'veredito', 'quattro_mais_barata');
begin
  ---------------------------------------------------------------- montagem ---
  insert into auth.users (id, email, aud, role)
  values (u, 'maquininha-pedidos@guarda.local', 'authenticated', 'authenticated');
  select org_id into o from public.organization_members where user_id = u limit 1;
  if o is null then
    raise exception 'GUARDA INVÁLIDA: o provisionamento não criou a empresa. Nada abaixo prova coisa alguma.';
  end if;
  perform pg_temp.como(u);
  -- A empresa recém-criada é a ativa (auth_org_id); sem isso nada abaixo prova coisa alguma.
  if public.auth_org_id() is distinct from o then
    raise exception 'GUARDA INVÁLIDA: auth_org_id() não devolveu a empresa do usuário de teste.';
  end if;

  -------------------------------------------- 1. a chamada antiga segue ----
  id_antigo := public.maquininha_pedido_criar(
    'pedir', 1, 'Comércio', 30000, null, 'Marina Alves', '11987654321', null,
    'Rua das Flores, 100 - Centro', 'pedido direto');
  select origem, simulacao into r from public.maquininha_pedidos where id = id_antigo;
  if r.origem is distinct from 'formulario' or r.simulacao is not null then
    falhas := array_append(falhas, format('1: a chamada antiga gravou origem=%s simulacao=%s', r.origem, r.simulacao));
  end if;

  ------------------------------------- 2. a nova grava origem e simulação ---
  id_novo := public.maquininha_pedido_criar(
    'pedir', 2, 'Comércio', 30000, null, 'Marina Alves', '11987654321', null,
    'Rua das Flores, 100 - Centro', 'pelo pop-up', 'economia', sim);
  select origem, simulacao into r from public.maquininha_pedidos where id = id_novo;
  if r.origem is distinct from 'economia' then
    falhas := array_append(falhas, format('2: a origem saiu %s, não economia', r.origem));
  end if;
  if (r.simulacao ->> 'economiaMes')::numeric is distinct from 120 then
    falhas := array_append(falhas, '2: a simulação não chegou ao banco');
  end if;

  ------------------------------------------------ 3. o banco recusa lixo ----
  begin
    perform public.maquininha_pedido_criar('pedir', 1, null, null, null, 'Marina', '11987654321', null, 'Rua das Flores, 100', null, 'whatsapp', null);
    falhas := array_append(falhas, '3: origem inventada (whatsapp) foi aceita');
  exception when check_violation then null;
  end;
  begin
    perform public.maquininha_pedido_criar('pedir', 1, null, null, null, 'Marina', '11987654321', null, 'Rua das Flores, 100', null, 'economia', '[1,2,3]'::jsonb);
    falhas := array_append(falhas, '3: simulação que não é objeto foi aceita');
  exception when check_violation then null;
  end;
  begin
    perform public.maquininha_pedido_criar('pedir', 1, null, null, null, 'Marina', '11987654321', null, 'Rua das Flores, 100', null, 'economia',
      jsonb_build_object('lixo', repeat('x', 5000)));
    falhas := array_append(falhas, '3: simulação de 5 mil letras foi aceita');
  exception when check_violation then null;
  end;

  ------------------------------------------------- 4. uma função só --------
  if pg_temp.candidatas() <> 1 then
    falhas := array_append(falhas, format('4: há %s funções maquininha_pedido_criar — o PostgREST não sabe qual chamar', pg_temp.candidatas()));
  end if;

  ---------------------------- 5. TESTE NEGATIVO: a assinatura antiga volta ---
  begin
    execute $planta$
      create function public.maquininha_pedido_criar(text, integer, text, numeric, text, text, text, text, text, text)
      returns uuid language sql as 'select null::uuid'
    $planta$;
    if pg_temp.candidatas() <> 1 then
      raise exception 'PLANTA_DETECTADA: % funções', pg_temp.candidatas();
    end if;
    falhas := array_append(falhas, '5: com a assinatura antiga recriada, a asserção 4 não reprovou');
  exception when raise_exception then
    get stacked diagnostics msg = message_text;
    if msg not like 'PLANTA_DETECTADA: 2 funções%' then
      falhas := array_append(falhas, format('5: vermelho pelo motivo errado: %s', msg));
    end if;
  end;
  if pg_temp.candidatas() <> 1 then
    falhas := array_append(falhas, '5: a planta não foi desfeita');
  end if;

  if array_length(falhas, 1) > 0 then
    raise exception E'GUARDA DO PEDIDO DE MAQUININHA REPROVOU:\n  %', array_to_string(falhas, E'\n  ');
  end if;
  raise notice 'pedido de maquininha: chamada antiga, simulação, recusas e função única — OK';
end
$guarda$;

rollback;
