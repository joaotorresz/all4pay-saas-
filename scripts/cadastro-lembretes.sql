-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA DOS LEMBRETES DO CADASTRO (etapa 5) — migration 20261028150000.
--
-- Prova, contra o banco de verdade e dentro de uma transação DESFEITA:
--   1. a candidata é a jornada parada há mais de 24 h, com contato, há menos
--      de 30 dias; a recente, a sem contato, a velha e a concluída ficam fora;
--   2. quem tem o mesmo contato numa jornada CONCLUÍDA sai marcada como
--      "já tem conta";
--   3. a reserva é UMA por canal: a segunda do mesmo canal devolve NULL, e a
--      terceira (com dois canais já usados) também;
--   4. a jornada concluída depois da lista não é reservada;
--   5. concluir só fecha a reserva aberta, uma vez;
--   6. o funil do admin devolve os lembretes da jornada;
--   7. anon e authenticated não executam nada do executor.
-- ═══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

begin;

do $montagem$
declare
  parada uuid := gen_random_uuid();     -- 2 dias parada, com WhatsApp e e-mail
  recente uuid := gen_random_uuid();    -- 1 hora parada
  sem uuid := gen_random_uuid();        -- 2 dias, sem contato
  velha uuid := gen_random_uuid();      -- 40 dias
  feita uuid := gen_random_uuid();      -- concluída
  dupla uuid := gen_random_uuid();      -- parada, mesmo WhatsApp da concluída
  tarde uuid := gen_random_uuid();      -- parada, e conclui entre a lista e a reserva
begin
  insert into public.cadastro_jornadas (id, etapa, contato_nome, contato_whatsapp, contato_email, atualizada_em, concluida_em) values
    (parada,  'senha',    'Marina Alves', '11987654321', 'marina@guarda.local', now() - interval '2 days', null),
    (recente, 'senha',    'Recente',      '11900000001', null,                  now() - interval '1 hour', null),
    (sem,     'documento', null,          null,          null,                  now() - interval '2 days', null),
    (velha,   'senha',    'Velha',        '11900000002', null,                  now() - interval '40 days', null),
    (feita,   'pronto',   'Feita',        '11900000003', 'feita@guarda.local',  now() - interval '3 days', now() - interval '3 days'),
    (dupla,   'senha',    'Dupla',        '11900000003', null,                  now() - interval '2 days', null),
    (tarde,   'senha',    'Tarde',        '11900000004', null,                  now() - interval '2 days', null);
  perform set_config('guarda.parada', parada::text, true);
  perform set_config('guarda.recente', recente::text, true);
  perform set_config('guarda.sem', sem::text, true);
  perform set_config('guarda.velha', velha::text, true);
  perform set_config('guarda.feita', feita::text, true);
  perform set_config('guarda.dupla', dupla::text, true);
  perform set_config('guarda.tarde', tarde::text, true);
end
$montagem$;

-- 1 e 2. as candidatas
do $$
declare
  c jsonb := public.cadastro_lembretes_candidatas(500);
  ids text[];
begin
  select array_agg(x ->> 'id') into ids from jsonb_array_elements(c) x;
  if not (current_setting('guarda.parada') = any(ids)) then
    raise exception 'FALHOU 1: a jornada parada há 2 dias com contato não é candidata.';
  end if;
  if current_setting('guarda.recente') = any(ids) or current_setting('guarda.sem') = any(ids)
     or current_setting('guarda.velha') = any(ids) or current_setting('guarda.feita') = any(ids) then
    raise exception 'FALHOU 1: entrou candidata que não devia (recente, sem contato, velha ou concluída): %', ids;
  end if;
  if (select (x ->> 'contato_ja_tem_conta')::boolean from jsonb_array_elements(c) x where x ->> 'id' = current_setting('guarda.dupla')) is distinct from true then
    raise exception 'FALHOU 2: quem tem o mesmo WhatsApp numa jornada concluída não saiu como "já tem conta".';
  end if;
  if (select (x ->> 'contato_ja_tem_conta')::boolean from jsonb_array_elements(c) x where x ->> 'id' = current_setting('guarda.parada')) is distinct from false then
    raise exception 'FALHOU 2: a jornada sem conta saiu como "já tem conta".';
  end if;
end $$;

-- 3, 4 e 5. a reserva e a conclusão
do $$
declare
  w uuid; w2 uuid; e uuid; x uuid;
  c jsonb;
begin
  w := public.cadastro_lembrete_reservar(current_setting('guarda.parada')::uuid, 'whatsapp');
  if w is null then raise exception 'FALHOU 3: a primeira reserva de WhatsApp não saiu.'; end if;
  w2 := public.cadastro_lembrete_reservar(current_setting('guarda.parada')::uuid, 'whatsapp');
  if w2 is not null then raise exception 'FALHOU 3: o mesmo canal foi reservado duas vezes — o lembrete sairia em dobro.'; end if;
  e := public.cadastro_lembrete_reservar(current_setting('guarda.parada')::uuid, 'email');
  if e is null then raise exception 'FALHOU 3: o e-mail (segundo canal) não foi reservado.'; end if;
  if (select count(*) from public.cadastro_lembretes where jornada_id = current_setting('guarda.parada')::uuid) <> 2 then
    raise exception 'FALHOU 3: a jornada não ficou com exatamente dois lembretes.';
  end if;
  x := public.cadastro_lembrete_reservar(current_setting('guarda.parada')::uuid, 'sms');
  if x is not null then raise exception 'FALHOU 3: um canal inventado foi reservado.'; end if;

  c := public.cadastro_lembretes_candidatas(500);
  if (select jsonb_array_length(y -> 'ja_lembrados') from jsonb_array_elements(c) y where y ->> 'id' = current_setting('guarda.parada')) <> 2 then
    raise exception 'FALHOU 3: a candidata não diz os canais já lembrados.';
  end if;

  update public.cadastro_jornadas set concluida_em = now() where id = current_setting('guarda.tarde')::uuid;
  if public.cadastro_lembrete_reservar(current_setting('guarda.tarde')::uuid, 'whatsapp') is not null then
    raise exception 'FALHOU 4: a jornada concluída depois da lista recebeu reserva de lembrete.';
  end if;

  if not public.cadastro_lembrete_concluir(w, 'enviado', 'SM123', null) then
    raise exception 'FALHOU 5: a reserva aberta não foi concluída.';
  end if;
  if public.cadastro_lembrete_concluir(w, 'falhou', null, 'de novo') then
    raise exception 'FALHOU 5: a reserva já concluída foi reescrita.';
  end if;
  if public.cadastro_lembrete_concluir(e, 'reservado', null, null) then
    raise exception 'FALHOU 5: concluir aceitou uma situação inventada.';
  end if;
  if (select situacao from public.cadastro_lembretes where id = w) <> 'enviado' then
    raise exception 'FALHOU 5: a situação gravada não é a do envio.';
  end if;
end $$;

-- 6. o funil do admin devolve os lembretes (como a plataforma, montagem de cadastro-admin.sql)
do $$
declare
  up uuid := gen_random_uuid();
  f jsonb;
  l jsonb;
begin
  insert into auth.users (id, email) values (up, 'lembretes-plataforma@guarda.local');
  insert into public.platform_admin_permitidos (email, motivo)
  values ('lembretes-plataforma@guarda.local', 'guarda dos lembretes do cadastro (desfeita no fim)')
  on conflict do nothing;
  insert into public.platform_admins (user_id, exige_mfa) values (up, false)
    on conflict (user_id) do update set exige_mfa = false, expira_em = null;
  perform set_config('request.jwt.claims', json_build_object('sub', up, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform set_config('request.jwt.claim.sub', up::text, true);
  f := public.admin_cadastro_funil(90);
  select x -> 'lembretes' into l from jsonb_array_elements(f) x where x ->> 'id' = current_setting('guarda.parada');
  if l is null or jsonb_array_length(l) <> 2 or not exists (select 1 from jsonb_array_elements(l) y where y ->> 'canal' = 'whatsapp' and y ->> 'situacao' = 'enviado') then
    raise exception 'FALHOU 6: o funil do admin não trouxe os lembretes da jornada: %', l;
  end if;
end $$;

-- 7. ninguém do cliente executa o executor
do $$
begin
  if has_function_privilege('anon', 'public.cadastro_lembretes_candidatas(integer)', 'execute')
     or has_function_privilege('authenticated', 'public.cadastro_lembretes_candidatas(integer)', 'execute')
     or has_function_privilege('anon', 'public.cadastro_lembrete_reservar(uuid, text)', 'execute')
     or has_function_privilege('authenticated', 'public.cadastro_lembrete_reservar(uuid, text)', 'execute')
     or has_function_privilege('authenticated', 'public.cadastro_lembrete_concluir(uuid, text, text, text)', 'execute')
     or has_table_privilege('authenticated', 'public.cadastro_lembretes', 'select')
     or has_table_privilege('anon', 'public.cadastro_lembretes', 'select') then
    raise exception 'FALHOU 7: anon ou authenticated alcançam os lembretes do cadastro.';
  end if;
end $$;

\echo '✓ cadastro-lembretes: candidatas certas, um lembrete por canal, dois no máximo, só a chave de serviço.'

rollback;
