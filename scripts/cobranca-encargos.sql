-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA — MULTA E JUROS DA COBRANÇA (migration 20261031120000)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Só quem ADMINISTRA muda a regra, pela função; a faixa é do banco; a outra
-- empresa não lê; a sessão do cliente não escreve direto na tabela. Cada
-- defeito plantado tem de reprovar COM a mensagem do caso, não por acaso.
-- Termina em ROLLBACK.
\set ON_ERROR_STOP on

begin;

do $montagem$
declare
  ua uuid := gen_random_uuid(); ul uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  oa uuid; ob uuid;
begin
  insert into auth.users (id, email) values
    (ua, 'enc-a@guarda.local'), (ul, 'enc-leitor@guarda.local'), (ub, 'enc-b@guarda.local');
  select om.org_id into oa from public.organization_members om where om.user_id = ua limit 1;
  select om.org_id into ob from public.organization_members om where om.user_id = ub limit 1;
  if oa is null or ob is null or oa = ob then
    raise exception 'GUARDA INVÁLIDA: o provisionamento não criou duas empresas.';
  end if;
  insert into public.organization_members (org_id, user_id, role) values (oa, ul, 'leitor')
    on conflict (org_id, user_id) do update set role = 'leitor';
  insert into public.user_active_org (user_id, org_id) values (ul, oa)
    on conflict (user_id) do update set org_id = excluded.org_id;
  perform set_config('guarda.ua', ua::text, true);
  perform set_config('guarda.ul', ul::text, true);
  perform set_config('guarda.ub', ub::text, true);
  perform set_config('guarda.oa', oa::text, true);
end
$montagem$;

create or replace function pg_temp.erro_como(p_user uuid, p_sql text) returns text language plpgsql as $$
declare msg text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
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

create or replace function pg_temp.conta_como(p_user uuid) returns int language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
  select count(*) into n from public.cobranca_encargos;
  reset role;
  return n;
end $$;

grant execute on all functions in schema pg_temp to authenticated;

create or replace function pg_temp.prova() returns void language plpgsql as $$
declare
  ua uuid := current_setting('guarda.ua')::uuid;
  ul uuid := current_setting('guarda.ul')::uuid;
  ub uuid := current_setting('guarda.ub')::uuid;
  msg text; r record;
begin
  -- 1. o leitor não muda a regra
  msg := pg_temp.erro_como(ul, 'select public.cobranca_encargos_definir(2, 1, 0, null)');
  if msg is null or msg not like '%só quem administra%' then
    raise exception 'CASO 1 FALHOU: o LEITOR mudou a multa e os juros (veio: %).', coalesce(msg, 'aceito');
  end if;
  -- 2. o titular grava, e regravar troca (uma regra por empresa)
  msg := pg_temp.erro_como(ua, 'select public.cobranca_encargos_definir(2, 1, 3, 30)');
  if msg is not null then raise exception 'CASO 2 FALHOU: o titular não gravou a regra (%).', msg; end if;
  msg := pg_temp.erro_como(ua, 'select public.cobranca_encargos_definir(2.5, 0.8, 5, null)');
  if msg is not null then raise exception 'CASO 2 FALHOU: o titular não regravou a regra (%).', msg; end if;
  select * into r from public.cobranca_encargos where org_id = current_setting('guarda.oa')::uuid;
  if r.multa_pct <> 2.5 or r.juros_mes_pct <> 0.8 or r.carencia_dias <> 5 or r.aceitar_ate_dias is not null
     or (select count(*) from public.cobranca_encargos where org_id = current_setting('guarda.oa')::uuid) <> 1 then
    raise exception 'CASO 2 FALHOU: a regra gravada não é a última pedida.';
  end if;
  -- 3. a faixa é do banco
  msg := pg_temp.erro_como(ua, 'select public.cobranca_encargos_definir(11, 1, 0, null)');
  if msg is null or msg not like '%cobranca_encargos%' then
    raise exception 'CASO 3 FALHOU: aceitou multa de 11%% (veio: %).', coalesce(msg, 'aceito');
  end if;
  msg := pg_temp.erro_como(ua, 'select public.cobranca_encargos_definir(2, 1, 10, 5)');
  if msg is null or msg not like '%prazo_depois_da_tolerancia%' then
    raise exception 'CASO 3 FALHOU: aceitou prazo de pagamento antes do fim da tolerância (veio: %).', coalesce(msg, 'aceito');
  end if;
  -- 4. a outra empresa não lê
  if pg_temp.conta_como(ub) <> 0 then
    raise exception 'CASO 4 FALHOU: a empresa B leu a regra de multa e juros da A.';
  end if;
  if pg_temp.conta_como(ua) <> 1 then
    raise exception 'CASO 4 FALHOU: a empresa A não lê a própria regra.';
  end if;
  -- 5. ninguém escreve direto na tabela
  msg := pg_temp.erro_como(ua, format('update public.cobranca_encargos set multa_pct = 9 where org_id = %L', current_setting('guarda.oa')));
  if msg is null or msg not like '%permission denied%' then
    raise exception 'CASO 5 FALHOU: a sessão do cliente ALTEROU a regra direto (veio: %).', coalesce(msg, 'aceito');
  end if;
  -- 6. a trilha registrou
  if not exists (select 1 from public.audit_log where entidade = 'cobranca_encargos') then
    raise exception 'CASO 6 FALHOU: mudar a multa e os juros não deixou trilha.';
  end if;
end $$;
grant execute on all functions in schema pg_temp to authenticated;

savepoint caso;
select pg_temp.prova();
rollback to savepoint caso;

-- ── defeitos plantados ──────────────────────────────────────────────────────
create or replace function pg_temp.reprova(p_padrao text, p_nome text) returns void language plpgsql as $$
declare msg text;
begin
  begin
    perform pg_temp.prova();
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

savepoint caso;
do $d1$ declare def text := pg_get_functiondef('public.cobranca_encargos_definir(numeric,numeric,int,int)'::regprocedure); begin
  execute replace(def, 'or not public.tem_permissao(''administrar'', v_org)', '');
  perform pg_temp.reprova('%CASO 1 FALHOU%LEITOR%', 'sem conferir o papel');
end $d1$;
rollback to savepoint caso;

savepoint caso;
do $d2$ begin
  drop policy cobranca_encargos_ler on public.cobranca_encargos;
  create policy cobranca_encargos_ler on public.cobranca_encargos for select to authenticated using (true);
  perform pg_temp.reprova('%CASO 4 FALHOU%empresa B leu%', 'a política sem a empresa');
end $d2$;
rollback to savepoint caso;

savepoint caso;
do $d3$ begin
  grant update on public.cobranca_encargos to authenticated;
  create policy cobranca_encargos_mudar on public.cobranca_encargos for update to authenticated using (org_id = public.auth_org_id());
  perform pg_temp.reprova('%CASO 5 FALHOU%', 'a escrita direta liberada');
end $d3$;
rollback to savepoint caso;

savepoint caso;
do $d4$ begin
  alter table public.cobranca_encargos drop constraint cobranca_encargos_multa_pct_check;
  perform pg_temp.reprova('%CASO 3 FALHOU%11%', 'sem o teto da multa');
end $d4$;
rollback to savepoint caso;

do $fim$ begin raise notice 'cobranca-encargos: 6 casos · 4 defeitos plantados pegos'; end $fim$;

rollback;
