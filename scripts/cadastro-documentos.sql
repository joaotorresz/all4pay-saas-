-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA DO COFRE DE DOCUMENTOS DO CADASTRO — a fechadura que só existe no banco
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/cadastro-documentos.sql
--
--   1. o registro grava o tipo, e o TAMANHO e o FORMATO saem do objeto do
--      Storage, nunca do navegador; guardar por 5 anos;
--   2. caminho na pasta de OUTRA empresa é recusado;
--   3. caminho com subpasta, `..` ou extensão estranha é recusado;
--   4. objeto que não existe no Storage é recusado;
--   5. objeto enviado por OUTRA pessoa é recusado;
--   6. tipo inventado é recusado;
--   7. o teto de 30 documentos por empresa;
--   8. ninguém lê nem escreve a tabela direto; anon não registra;
--   9. o bucket é privado e a única política dele é CRIAR na pasta da empresa.
--
-- ⚠️ O Storage do CI (`supabase start` sem o storage-api) pode não ter as
-- tabelas. Sem elas, a guarda monta um `storage.objects` mínimo DENTRO da
-- transação (desfeito no fim) — a função lê o Storage por SQL dinâmico, então
-- os casos 1, 4 e 5 provam a regra nos dois bancos. O caso 9 só roda onde há
-- Storage de verdade, e diz quando pulou.
--
-- ⚠️ SAVEPOINT POR CASO e o MESMO caminho em todos: um rollback que deixe de
-- acontecer faz o caso seguinte colidir na hora. Usuários pelo gatilho de
-- signup (`auth.users`), como em `cadastro-jornada.sql`. Tudo em ROLLBACK.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

begin;

------------------------------------------------------------------ montagem ---
do $montagem$
declare
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  oa uuid; ob uuid;
  real boolean := to_regclass('storage.objects') is not null;
begin
  insert into auth.users (id, email) values (ua, 'cofre-a@guarda.local'), (ub, 'cofre-b@guarda.local');
  select om.org_id into oa from public.organization_members om where om.user_id = ua limit 1;
  select om.org_id into ob from public.organization_members om where om.user_id = ub limit 1;
  if oa is null or ob is null or oa = ob then
    raise exception 'GUARDA INVÁLIDA: o provisionamento não criou duas empresas. Nada abaixo prova coisa alguma.';
  end if;
  if not real then
    raise notice 'cofre: este banco não tem o Storage; montando um storage.objects mínimo, desfeito no fim.';
    execute 'create schema if not exists storage';
    execute 'create table storage.objects (bucket_id text, name text, owner uuid, metadata jsonb)';
  end if;
  perform set_config('guarda.ua', ua::text, true);
  perform set_config('guarda.ub', ub::text, true);
  perform set_config('guarda.oa', oa::text, true);
  perform set_config('guarda.ob', ob::text, true);
  perform set_config('guarda.real', real::text, true);
  perform set_config('guarda.uuid', '0f1e2d3c-4b5a-4968-8776-655443322110', true);
end;
$montagem$;

-- Entra como a pessoa A (a sessão do cadastro que acabou de nascer).
create or replace function pg_temp.como(u text) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', u, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
end $f$;

create or replace function pg_temp.objeto(caminho text, dono text) returns void language plpgsql as $f$
begin
  execute 'insert into storage.objects (bucket_id, name, owner, metadata) values ($1, $2, $3, $4)'
    using 'cadastro-documentos', caminho, dono::uuid, '{"mimetype":"image/jpeg","size":"123456"}'::jsonb;
end $f$;

------------------------------------------- 1. registra, metadados do Storage ---
savepoint caso;
do $c$
declare
  cam text := current_setting('guarda.oa') || '/selfie-' || current_setting('guarda.uuid') || '.jpg';
  r text; d public.cadastro_documentos;
begin
  perform pg_temp.objeto(cam, current_setting('guarda.ua'));
  perform pg_temp.como(current_setting('guarda.ua'));
  set local role authenticated;
  r := public.cadastro_documento_registrar('selfie', cam);
  reset role;
  if r <> 'ok' then raise exception 'CASO 1: o registro legítimo devolveu %', r; end if;
  select * into d from public.cadastro_documentos where caminho = cam;
  if d.id is null then raise exception 'CASO 1: devolveu ok e não gravou'; end if;
  if d.org_id <> current_setting('guarda.oa')::uuid or d.user_id <> current_setting('guarda.ua')::uuid then
    raise exception 'CASO 1: gravou com empresa ou pessoa errada'; end if;
  if d.tamanho is distinct from 123456 or d.mime is distinct from 'image/jpeg' then
    raise exception 'CASO 1: tamanho/formato não vieram do objeto do Storage (% / %)', d.tamanho, d.mime; end if;
  if d.guardar_ate <> (current_date + interval '5 years')::date then
    raise exception 'CASO 1: guardar_ate é % e devia ser 5 anos a partir de hoje', d.guardar_ate; end if;
end $c$;
rollback to savepoint caso;

------------------------------------------- 2. pasta de OUTRA empresa ---
savepoint caso;
do $c$
declare
  cam text := current_setting('guarda.ob') || '/selfie-' || current_setting('guarda.uuid') || '.jpg';
  r text;
begin
  perform pg_temp.objeto(cam, current_setting('guarda.ua'));
  perform pg_temp.como(current_setting('guarda.ua'));
  set local role authenticated;
  r := public.cadastro_documento_registrar('selfie', cam);
  reset role;
  if r <> 'invalido' then raise exception 'CASO 2: caminho na pasta de outra empresa devolveu % — devia ser invalido', r; end if;
  if exists (select 1 from public.cadastro_documentos where caminho = cam) then raise exception 'CASO 2: gravou na pasta alheia'; end if;
end $c$;
rollback to savepoint caso;

------------------------------------------- 3. caminho torto ---
savepoint caso;
do $c$
declare
  oa text := current_setting('guarda.oa'); u text := current_setting('guarda.uuid');
  cam text; r text;
begin
  perform pg_temp.como(current_setting('guarda.ua'));
  foreach cam in array array[
    oa || '/x/selfie-' || u || '.jpg',
    oa || '/../' || current_setting('guarda.ob') || '/selfie-' || u || '.jpg',
    oa || '/selfie-' || u || '.exe',
    oa || '/rg-' || u || '.jpg'                -- tipo do caminho ≠ tipo pedido
  ] loop
    perform pg_temp.objeto(cam, current_setting('guarda.ua'));
    set local role authenticated;
    r := public.cadastro_documento_registrar('selfie', cam);
    reset role;
    if r <> 'invalido' then raise exception 'CASO 3: o caminho % devolveu % — devia ser invalido', cam, r; end if;
  end loop;
end $c$;
rollback to savepoint caso;

------------------------------------------- 4. objeto que não existe ---
savepoint caso;
do $c$
declare
  cam text := current_setting('guarda.oa') || '/selfie-' || current_setting('guarda.uuid') || '.jpg';
  r text;
begin
  perform pg_temp.como(current_setting('guarda.ua'));
  set local role authenticated;
  r := public.cadastro_documento_registrar('selfie', cam);
  reset role;
  if r <> 'sem_arquivo' then raise exception 'CASO 4: registrar sem o arquivo no Storage devolveu % — devia ser sem_arquivo', r; end if;
end $c$;
rollback to savepoint caso;

------------------------------------------- 5. objeto de OUTRA pessoa ---
savepoint caso;
do $c$
declare
  cam text := current_setting('guarda.oa') || '/selfie-' || current_setting('guarda.uuid') || '.jpg';
  r text;
begin
  perform pg_temp.objeto(cam, current_setting('guarda.ub'));
  perform pg_temp.como(current_setting('guarda.ua'));
  set local role authenticated;
  r := public.cadastro_documento_registrar('selfie', cam);
  reset role;
  if r <> 'invalido' then raise exception 'CASO 5: objeto enviado por outra pessoa devolveu % — devia ser invalido', r; end if;
end $c$;
rollback to savepoint caso;

------------------------------------------- 6. tipo inventado ---
savepoint caso;
do $c$
declare
  cam text := current_setting('guarda.oa') || '/holerite-' || current_setting('guarda.uuid') || '.jpg';
  r text;
begin
  perform pg_temp.objeto(cam, current_setting('guarda.ua'));
  perform pg_temp.como(current_setting('guarda.ua'));
  set local role authenticated;
  r := public.cadastro_documento_registrar('holerite', cam);
  reset role;
  if r <> 'invalido' then raise exception 'CASO 6: tipo inventado devolveu % — devia ser invalido', r; end if;
end $c$;
rollback to savepoint caso;

------------------------------------------- 7. teto de 30 por empresa ---
savepoint caso;
do $c$
declare
  oa text := current_setting('guarda.oa');
  cam text := oa || '/selfie-' || current_setting('guarda.uuid') || '.jpg';
  r text;
begin
  insert into public.cadastro_documentos (org_id, user_id, tipo, caminho)
  select oa::uuid, current_setting('guarda.ua')::uuid, 'rg', oa || '/rg-' || gen_random_uuid() || '.jpg'
    from generate_series(1, 30);
  perform pg_temp.objeto(cam, current_setting('guarda.ua'));
  perform pg_temp.como(current_setting('guarda.ua'));
  set local role authenticated;
  r := public.cadastro_documento_registrar('selfie', cam);
  reset role;
  if r <> 'limite' then raise exception 'CASO 7: o 31º documento devolveu % — devia ser limite', r; end if;
end $c$;
rollback to savepoint caso;

------------------------------------------- 8. sem acesso direto ---
savepoint caso;
do $c$
declare leu boolean := false; gravou boolean := false; anon_chamou boolean := false;
begin
  perform pg_temp.como(current_setting('guarda.ua'));
  set local role authenticated;
  begin perform 1 from public.cadastro_documentos limit 1; leu := true; exception when insufficient_privilege then null; end;
  begin
    insert into public.cadastro_documentos (tipo, caminho) values ('rg', 'x'); gravou := true;
  exception when insufficient_privilege or check_violation or not_null_violation then null; end;
  reset role;
  set local role anon;
  begin perform public.cadastro_documento_registrar('rg', 'x'); anon_chamou := true; exception when insufficient_privilege then null; end;
  reset role;
  if leu then raise exception 'CASO 8: authenticated leu a tabela dos documentos direto'; end if;
  if gravou then raise exception 'CASO 8: authenticated gravou na tabela dos documentos direto'; end if;
  if anon_chamou then raise exception 'CASO 8: anon chamou o registro'; end if;
end $c$;
rollback to savepoint caso;

------------------------------------------- 9. bucket privado, só CRIAR ---
do $c$
declare n_outras int; n_envio int;
begin
  if not current_setting('guarda.real')::boolean then
    raise notice 'CASO 9 PULADO: este banco não tem o Storage do Supabase (o bucket e a política são conferidos em produção pela migration).';
    return;
  end if;
  if not exists (select 1 from storage.buckets where id = 'cadastro-documentos' and public = false) then
    raise exception 'CASO 9: o bucket cadastro-documentos não existe ou é público'; end if;
  select count(*) into n_envio from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and policyname = 'cadastro_documentos_envio' and cmd = 'INSERT';
  select count(*) into n_outras from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and cmd <> 'INSERT'
     and (coalesce(qual, '') like '%cadastro-documentos%' or coalesce(with_check, '') like '%cadastro-documentos%');
  if n_envio <> 1 then raise exception 'CASO 9: a política de envio não existe'; end if;
  if n_outras > 0 then raise exception 'CASO 9: há % política(s) de leitura/troca/exclusão no bucket dos documentos', n_outras; end if;
end $c$;

rollback;

\echo '✓ cadastro-documentos: o cofre só aceita o arquivo da própria empresa e da própria pessoa, e ninguém o lê pelo app.'
