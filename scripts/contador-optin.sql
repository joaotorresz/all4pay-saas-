-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA DO OPT-IN DO CONTADOR (migration 20261104130000)
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/contador-optin.sql
--
-- Quem cadastra o e-mail do contador não pode se confirmar sozinho: o token
-- só viaja no e-mail. Esta guarda prova, no banco construído do zero:
--
--   1. o membro lê a situação da própria empresa (e-mail, pedido, confirmação);
--   2. o membro NÃO lê o token (privilégio por coluna);
--   3. o membro NÃO grava (nem cria pedido, nem marca confirmado);
--   4. a outra empresa não vê a linha;
--   5. e-mail inválido é recusado; token repetido é recusado;
--   6. o pedido entra na trilha (audit_log) SEM o token.
--
-- Cada recusa tem de NOMEAR o motivo. Termina em ROLLBACK.
-- ═══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('c5000000-0000-0000-0000-000000000001', 'optin-a@guarda.test', '{"company":"Guarda Opt-in A"}'),
  ('c5000000-0000-0000-0000-000000000002', 'optin-b@guarda.test', '{"company":"Guarda Opt-in B"}');

create or replace function pg_temp.como(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u::text, true);
end $$;

create or replace function pg_temp.recusa(sql text, motivo text, caso text) returns void language plpgsql as $$
declare v_msg text;
begin
  begin
    execute sql;
  exception when others then
    v_msg := sqlerrm;
  end;
  if v_msg is null then
    raise exception 'CASO % FALHOU: passou.', caso;
  end if;
  if v_msg not like '%' || motivo || '%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO no caso %: "%" não cita "%".', caso, v_msg, motivo;
  end if;
end $$;

do $$
declare o uuid;
begin
  select org_id into o from public.organization_members where user_id = 'c5000000-0000-0000-0000-000000000001' limit 1;
  if o is null then raise exception 'GUARDA INVÁLIDA: o provisionamento não criou a empresa.'; end if;
  -- O pedido nasce pela chave de serviço (a rota do servidor).
  insert into public.contador_confirmacoes (org_id, dest_id, email) values (o, 'dest_guarda', 'contador@escritorio.test');
  perform set_config('guarda.org', o::text, true);
end $$;

-- 6. a trilha registra o pedido e não guarda o token
do $$
declare n int; vaz int;
begin
  select count(*), count(*) filter (where coalesce(antes::text, '') || coalesce(depois::text, '') like '%' || c.token::text || '%')
    into n, vaz
    from public.audit_log a
    join public.contador_confirmacoes c on c.org_id = a.org_id
   where a.entidade = 'contador_confirmacoes';
  if n < 1 then raise exception 'CASO 6 FALHOU: o pedido não entrou na trilha.'; end if;
  if vaz > 0 then raise exception 'CASO 6 FALHOU: a trilha guarda o token do link.'; end if;
end $$;

-- 5. o banco recusa
savepoint c5a;
select pg_temp.recusa(format($q$insert into public.contador_confirmacoes (org_id, dest_id, email) values (%L, 'dest_x', 'sem-arroba')$q$, current_setting('guarda.org')),
  'contador_confirmacoes_email', '5 e-mail inválido');
rollback to savepoint c5a;
savepoint c5b;
select pg_temp.recusa(format($q$insert into public.contador_confirmacoes (org_id, dest_id, email, token) select %L, 'dest_y', 'y@escritorio.test', token from public.contador_confirmacoes where dest_id = 'dest_guarda'$q$, current_setting('guarda.org')),
  'contador_confirmacoes_token_unico', '5 token repetido');
rollback to savepoint c5b;

-- 1, 2 e 3: o membro da empresa
select pg_temp.como('c5000000-0000-0000-0000-000000000001');
set local role authenticated;
do $$
begin
  if (select count(*) from public.contador_confirmacoes where dest_id = 'dest_guarda' and confirmado_em is null) <> 1 then
    raise exception 'CASO 1 FALHOU: o membro não lê a situação do pedido da própria empresa.';
  end if;
end $$;
savepoint c2;
select pg_temp.recusa($q$select token from public.contador_confirmacoes$q$, 'permission denied', '2 membro lê o token');
rollback to savepoint c2;
savepoint c3a;
select pg_temp.recusa($q$update public.contador_confirmacoes set confirmado_em = now() where dest_id = 'dest_guarda'$q$, 'permission denied', '3 membro se confirma');
rollback to savepoint c3a;
savepoint c3b;
select pg_temp.recusa(format($q$insert into public.contador_confirmacoes (org_id, dest_id, email) values (%L, 'dest_z', 'z@escritorio.test')$q$, current_setting('guarda.org')),
  'permission denied', '3 membro cria pedido');
rollback to savepoint c3b;
reset role;

-- 4. a outra empresa
select pg_temp.como('c5000000-0000-0000-0000-000000000002');
set local role authenticated;
do $$
begin
  if (select count(*) from public.contador_confirmacoes) <> 0 then
    raise exception 'CASO 4 FALHOU: a empresa B vê o pedido da empresa A.';
  end if;
  raise notice '✓ contador-optin: 6 casos (lê a situação, não lê o token, não grava, isolado, banco recusa e-mail e token repetidos, trilha sem o token)';
end $$;
reset role;

rollback;
