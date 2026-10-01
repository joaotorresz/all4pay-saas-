-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA (Rodada 6): o papel vale em toda tabela que carrega dinheiro.
-- Um LEITOR é recusado ao gravar venda, recorrência, cadastro e razão; o
-- CONTADOR EXTERNO grava no razão (fecha o mês) e é recusado na venda; o
-- TITULAR grava tudo; e o leitor continua LENDO. Termina em ROLLBACK.
-- Cada caso em savepoint; cada recusa tem de NOMEAR a política.
-- ═══════════════════════════════════════════════════════════════════════════
begin;

insert into auth.users (id, email) values
  ('a1000000-0000-0000-0000-000000000001', 'titular.papel@guarda.test'),
  ('a1000000-0000-0000-0000-000000000002', 'leitor.papel@guarda.test'),
  ('a1000000-0000-0000-0000-000000000003', 'contador.papel@guarda.test');

do $$
declare
  v_org uuid;
  v_msg text;
  v_n int;
  procedure_ok boolean;
begin
  select org_id into v_org from public.organization_members
   where user_id = 'a1000000-0000-0000-0000-000000000001';
  insert into public.organization_members (org_id, user_id, role) values
    (v_org, 'a1000000-0000-0000-0000-000000000002', 'leitor'),
    (v_org, 'a1000000-0000-0000-0000-000000000003', 'contador_externo');
  insert into public.user_active_org (user_id, org_id) values
    ('a1000000-0000-0000-0000-000000000002', v_org),
    ('a1000000-0000-0000-0000-000000000003', v_org)
  on conflict (user_id) do update set org_id = excluded.org_id;
  perform set_config('guarda.org', v_org::text, true);
end $$;

create or replace function pg_temp.como(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u::text, true);
end $$;

create or replace function pg_temp.recusa(sql text, politica text, caso text) returns void language plpgsql as $$
declare v_msg text;
begin
  begin
    execute sql;
  exception when others then
    v_msg := sqlerrm;
  end;
  if v_msg is null then
    raise exception 'CASO % FALHOU: a gravação PASSOU — o papel não vale nesta tabela.', caso;
  end if;
  if v_msg not like '%' || politica || '%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO no caso %: "%" não cita a política %.', caso, v_msg, politica;
  end if;
end $$;

-- ── leitor: recusado em venda, recorrência, cadastro ──
select pg_temp.como('a1000000-0000-0000-0000-000000000002');
set local role authenticated;
savepoint c1;
select pg_temp.recusa(format($q$insert into public.recurrences(org_id,type,amount,freq,start_date,description) values (%L,'entrada',10,'mensal','2026-10-01','x')$q$, current_setting('guarda.org')), 'recurrences_escrita_exige_papel', '1 leitor/recorrência');
rollback to savepoint c1;
savepoint c2;
select pg_temp.recusa(format($q$insert into public.parties(org_id,name,type) values (%L,'Contato do leitor','pj')$q$, current_setting('guarda.org')), 'parties_escrita_exige_papel', '2 leitor/contato');
rollback to savepoint c2;
savepoint c3;
select pg_temp.recusa(format($q$insert into public.journal_entries(org_id,entry_date,status) values (%L,'2026-10-01','draft')$q$, current_setting('guarda.org')), 'journal_entries_escrita_exige_papel', '3 leitor/razão');
rollback to savepoint c3;
reset role;

-- ── contador externo: grava no razão, é recusado na venda ──
select pg_temp.como('a1000000-0000-0000-0000-000000000003');
set local role authenticated;
savepoint c4;
insert into public.journal_entries(org_id, entry_date, status) values (current_setting('guarda.org')::uuid, '2026-10-01', 'draft');
rollback to savepoint c4;
savepoint c5;
select pg_temp.recusa(format($q$insert into public.recurrences(org_id,type,amount,freq,start_date,description) values (%L,'entrada',10,'mensal','2026-10-01','x')$q$, current_setting('guarda.org')), 'recurrences_escrita_exige_papel', '5 contador/recorrência');
rollback to savepoint c5;
reset role;

-- ── titular: grava; leitor: continua lendo ──
select pg_temp.como('a1000000-0000-0000-0000-000000000001');
set local role authenticated;
insert into public.recurrences(org_id,type,amount,freq,start_date,description)
  values (current_setting('guarda.org')::uuid,'entrada',10,'mensal','2026-10-01','titular');
reset role;
select pg_temp.como('a1000000-0000-0000-0000-000000000002');
set local role authenticated;
do $$
begin
  if (select count(*) from public.recurrences where description = 'titular') <> 1 then
    raise exception 'CASO 6 FALHOU: o LEITOR deixou de ler — a política de escrita cortou a leitura.';
  end if;
  raise notice 'papel-dinheiro: 6 casos verdes';
end $$;
reset role;

rollback;
