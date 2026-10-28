-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA DA JORNADA DO CADASTRO — a fechadura que só existe no banco
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/cadastro-jornada.sql
--
-- A guarda pura (`npm run cadastro-jornada`) prova a DECISÃO: o que a rota
-- aceita, o que vira "parou" e o que nunca sai do navegador. Esta prova a
-- FECHADURA:
--
--   1. a chave de serviço registra; o passo guarda a PRIMEIRA chegada;
--   2. passo inválido é recusado sem gravar;
--   3. o teto de 30 jornadas novas por hora por origem;
--   4. concluir com a sessão liga a jornada à empresa ABERTA de quem chama;
--   5. jornada concluída não volta a "em andamento" nem troca de empresa;
--   6. anon e authenticated não registram, não leem e não escrevem direto.
--
-- ⚠️ SAVEPOINT POR CASO, e o MESMO id de jornada em todos: se um `rollback to
-- savepoint` deixar de acontecer, o caso seguinte encontra a jornada do
-- anterior e reprova na hora, em vez de passar por acidente de ordem.
--
-- ⚠️ Os usuários entram por `auth.users` (o gatilho de signup provisiona) — o
-- arreio é o de `caixa-email.sql`, copiado. Tudo termina em ROLLBACK. Nada de
-- `raise` dentro de bloco protegido: marca-se e julga-se FORA.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

begin;

------------------------------------------------------------------ montagem ---
do $montagem$
declare
  ua uuid := gen_random_uuid();
  oa uuid;
begin
  insert into auth.users (id, email) values (ua, 'jornada-a@guarda.local');
  select om.org_id into oa from public.organization_members om where om.user_id = ua limit 1;
  if oa is null then
    raise exception 'GUARDA INVÁLIDA: o provisionamento não criou a empresa. Nada abaixo prova coisa alguma.';
  end if;
  perform set_config('guarda.ua', ua::text, true);
  perform set_config('guarda.oa', oa::text, true);
  perform set_config('guarda.j', '11111111-2222-4333-8444-555555555555', true);
end;
$montagem$;

-------------------------------------------------- 1. registra, 1ª chegada ---
savepoint caso;
do $c$
declare
  j uuid := current_setting('guarda.j')::uuid;
  r text; antes timestamptz; depois timestamptz; linha public.cadastro_jornadas;
begin
  set local role service_role;
  r := public.cadastro_jornada_registrar(j, 'tipo', null, null, null, null, 'abcdef0123456789');
  if r <> 'ok' then raise exception 'CASO 1: registrar devolveu %', r; end if;
  reset role;
  select (etapas->>'tipo')::timestamptz into antes from public.cadastro_jornadas where id = j;
  set local role service_role;
  perform public.cadastro_jornada_registrar(j, 'documento', 'pj', 'Ana Souza', '11987654321', 'ana@empresa.com.br', 'abcdef0123456789');
  perform public.cadastro_jornada_registrar(j, 'tipo', null, null, null, null, 'abcdef0123456789');
  reset role;
  select * into linha from public.cadastro_jornadas where id = j;
  depois := (linha.etapas->>'tipo')::timestamptz;
  if linha.etapa <> 'tipo' then raise exception 'CASO 1: o passo mais recente não foi guardado (%).', linha.etapa; end if;
  if depois is distinct from antes then raise exception 'CASO 1: voltar ao passo apagou a PRIMEIRA chegada.'; end if;
  if not (linha.etapas ? 'documento') then raise exception 'CASO 1: o passo documento não entrou no mapa.'; end if;
  if linha.contato_whatsapp <> '11987654321' or linha.tipo <> 'pj' then
    raise exception 'CASO 1: o contato ou o tipo não foram guardados.';
  end if;
  -- o passo seguinte sem contato NÃO apaga o contato já dado
  set local role service_role;
  perform public.cadastro_jornada_registrar(j, 'senha', null, null, null, null, 'abcdef0123456789');
  reset role;
  if (select contato_email from public.cadastro_jornadas where id = j) is null then
    raise exception 'CASO 1: um passo sem contato apagou o e-mail guardado.';
  end if;
end;
$c$;
rollback to savepoint caso;

--------------------------------------------------- 2. passo inválido ---------
savepoint caso;
do $c$
declare j uuid := current_setting('guarda.j')::uuid; r text;
begin
  set local role service_role;
  r := public.cadastro_jornada_registrar(j, 'tipo; drop table x', null, null, null, null, null);
  if r <> 'invalido' then raise exception 'CASO 2: passo com pontuação devolveu % (esperado invalido).', r; end if;
  reset role;
  if exists (select 1 from public.cadastro_jornadas where id = j) then
    raise exception 'CASO 2: o passo inválido gravou uma jornada.';
  end if;
end;
$c$;
rollback to savepoint caso;

--------------------------------------------------- 3. teto por origem --------
savepoint caso;
do $c$
declare i int; r text;
begin
  set local role service_role;
  for i in 1..30 loop
    r := public.cadastro_jornada_registrar(gen_random_uuid(), 'tipo', null, null, null, null, 'ffffffffffffffff');
    if r <> 'ok' then raise exception 'CASO 3: a jornada % de 30 foi recusada (%).', i, r; end if;
  end loop;
  r := public.cadastro_jornada_registrar(current_setting('guarda.j')::uuid, 'tipo', null, null, null, null, 'ffffffffffffffff');
  if r <> 'limite' then raise exception 'CASO 3: a 31ª jornada da mesma origem devolveu % (esperado limite).', r; end if;
  -- outra origem segue livre
  r := public.cadastro_jornada_registrar(gen_random_uuid(), 'tipo', null, null, null, null, 'eeeeeeeeeeeeeeee');
  if r <> 'ok' then raise exception 'CASO 3: o teto de uma origem travou outra.'; end if;
end;
$c$;
rollback to savepoint caso;

--------------------------------------- 4 e 5. concluir com a sessão ----------
savepoint caso;
do $c$
declare
  j uuid := current_setting('guarda.j')::uuid;
  ua uuid := current_setting('guarda.ua')::uuid;
  oa uuid := current_setting('guarda.oa')::uuid;
  ok boolean; linha public.cadastro_jornadas;
begin
  set local role service_role;
  perform public.cadastro_jornada_registrar(j, 'senha', 'pf', 'Bia', null, 'bia@email.com', null);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ua::text, true);
  set local role authenticated;
  ok := public.cadastro_jornada_concluir(j);
  if not ok then raise exception 'CASO 4: concluir com a sessão devolveu falso.'; end if;
  ok := public.cadastro_jornada_concluir(j);
  if ok then raise exception 'CASO 5: concluir DUAS vezes foi aceito.'; end if;
  reset role;
  set local role service_role;
  perform public.cadastro_jornada_registrar(j, 'senha', null, null, null, null, null);
  reset role;
  select * into linha from public.cadastro_jornadas where id = j;
  if linha.org_id is distinct from oa then raise exception 'CASO 4: a jornada não ficou com a empresa aberta de quem concluiu.'; end if;
  if linha.concluida_em is null or linha.etapa <> 'pronto' then
    raise exception 'CASO 5: o evento atrasado tirou a jornada de concluída (etapa %).', linha.etapa;
  end if;
end;
$c$;
rollback to savepoint caso;

---------------------------------------- 6. o cliente não chega na tabela ------
savepoint caso;
do $c$
declare j uuid := current_setting('guarda.j')::uuid; barrado_anon boolean := false; barrado_auth boolean := false;
        leu boolean := false; escreveu boolean := false; anon_concluiu boolean := false;
begin
  begin
    set local role anon;
    perform public.cadastro_jornada_registrar(j, 'tipo', null, null, null, null, null);
  exception when insufficient_privilege then barrado_anon := true;
  end;
  reset role;
  begin
    set local role authenticated;
    perform public.cadastro_jornada_registrar(j, 'tipo', null, null, null, null, null);
  exception when insufficient_privilege then barrado_auth := true;
  end;
  reset role;
  begin
    set local role authenticated;
    perform 1 from public.cadastro_jornadas limit 1;
    leu := true;
  exception when insufficient_privilege then null;
  end;
  reset role;
  begin
    set local role anon;
    insert into public.cadastro_jornadas (id, etapa) values (j, 'tipo');
    escreveu := true;
  exception when insufficient_privilege then null;
  end;
  reset role;
  begin
    set local role anon;
    perform public.cadastro_jornada_concluir(j);
    anon_concluiu := true;
  exception when insufficient_privilege then null;
  end;
  reset role;
  if not barrado_anon then raise exception 'CASO 6: anon executou o registro.'; end if;
  if not barrado_auth then raise exception 'CASO 6: authenticated executou o registro (só a rota, com service_role).'; end if;
  if leu then raise exception 'CASO 6: a sessão do cliente leu a tabela de jornadas.'; end if;
  if escreveu then raise exception 'CASO 6: anon inseriu direto na tabela.'; end if;
  if anon_concluiu then raise exception 'CASO 6: anon executou o concluir.'; end if;
end;
$c$;
rollback to savepoint caso;

do $fim$ begin raise notice 'cadastro-jornada: 6 casos · registro, 1ª chegada, recusa, teto, conclusão e acesso conferidos'; end $fim$;

rollback;
