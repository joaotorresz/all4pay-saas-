-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA DAS COMPRAS — a tabela própria (migration 20261103200000)
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/compras.sql
--
-- A compra saiu de `org_state` para `public.compras`. Esta guarda prova, no
-- banco construído do zero pelas migrations:
--
--   1. o titular grava, e numero/status/valor saem do documento (geradas);
--   2. o LEITOR lê e é recusado ao gravar (a mesma exigência de org_state);
--   3. ninguém apaga direto: o leitor não exclui; o titular exclui pela
--      lixeira (some da leitura) e restaura;
--   4. a empresa B não lê a compra de A;
--   5. número repetido na mesma empresa é recusado;
--   6. status fora da lista é recusado;
--   7. a coluna gerada não aceita gravação direta (um escritor só: o documento);
--   8. o id da linha tem de ser o id do documento;
--   9. gravar deixa evento na trilha;
--  10. a cópia de org_state traz o pedido válido, deixa o inválido, e
--      reaplicar a migration não duplica (zero linhas novas).
--
-- ⚠️ O arreio é o de `papel-dinheiro.sql`, copiado. Cada recusa tem de NOMEAR
-- a política ou a restrição; recusa por outro motivo reprova. Termina em
-- ROLLBACK.
-- ═══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('c1000000-0000-0000-0000-000000000001', 'titular.compras@guarda.test'),
  ('c1000000-0000-0000-0000-000000000002', 'leitor.compras@guarda.test'),
  ('c1000000-0000-0000-0000-000000000003', 'titular-b.compras@guarda.test');

do $$
declare
  v_org uuid;
  v_org_b uuid;
begin
  select org_id into v_org from public.organization_members
   where user_id = 'c1000000-0000-0000-0000-000000000001';
  select org_id into v_org_b from public.organization_members
   where user_id = 'c1000000-0000-0000-0000-000000000003';
  if v_org is null or v_org_b is null or v_org = v_org_b then
    raise exception 'GUARDA INVÁLIDA: o provisionamento não criou duas empresas. Nada abaixo prova coisa alguma.';
  end if;
  insert into public.organization_members (org_id, user_id, role) values
    (v_org, 'c1000000-0000-0000-0000-000000000002', 'leitor');
  insert into public.user_active_org (user_id, org_id) values
    ('c1000000-0000-0000-0000-000000000002', v_org)
  on conflict (user_id) do update set org_id = excluded.org_id;
  perform set_config('guarda.org', v_org::text, true);
  perform set_config('guarda.org_b', v_org_b::text, true);
end $$;

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
    raise exception 'CASO % FALHOU: a gravação PASSOU.', caso;
  end if;
  if v_msg not like '%' || motivo || '%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO no caso %: "%" não cita %.', caso, v_msg, motivo;
  end if;
end $$;

create or replace function pg_temp.compra(id text, numero text, status text, valor numeric) returns jsonb language sql as $$
  select jsonb_build_object('id', id, 'numero', numero, 'status', status, 'valor', valor,
    'fornecedor', 'Fornecedor da guarda', 'vencimento', '2026-11-10', 'competencia', '2026-11-01')
$$;

-- ── 1. titular grava; as colunas saem do documento ──
select pg_temp.como('c1000000-0000-0000-0000-000000000001');
set local role authenticated;
insert into public.compras (id, dados) values ('cmp_g1', pg_temp.compra('cmp_g1', 'CP-2026-0001', 'aguardando', 1234.56));
do $$
declare r record;
begin
  select org_id, numero, status, valor into r from public.compras where id = 'cmp_g1';
  if r.org_id is distinct from current_setting('guarda.org')::uuid then
    raise exception 'CASO 1 FALHOU: a compra não nasceu na empresa aberta (org_id %).', r.org_id;
  end if;
  if r.numero <> 'CP-2026-0001' or r.status <> 'aguardando' or r.valor <> 1234.56 then
    raise exception 'CASO 1 FALHOU: as colunas geradas não acompanham o documento (%, %, %).', r.numero, r.status, r.valor;
  end if;
end $$;
-- A aprovação muda o documento, e a coluna acompanha.
update public.compras set dados = dados || '{"status":"aprovada"}' where id = 'cmp_g1';
do $$
begin
  if (select status from public.compras where id = 'cmp_g1') <> 'aprovada' then
    raise exception 'CASO 1 FALHOU: aprovar no documento não mudou o status gerado.';
  end if;
end $$;

-- ── 5, 6, 7 e 8: o banco recusa ──
savepoint c5;
select pg_temp.recusa($q$insert into public.compras (id, dados) values ('cmp_g2', pg_temp.compra('cmp_g2', 'CP-2026-0001', 'aguardando', 10))$q$,
  'compras_numero_unico', '5 número repetido');
rollback to savepoint c5;
savepoint c6;
select pg_temp.recusa($q$insert into public.compras (id, dados) values ('cmp_g3', pg_temp.compra('cmp_g3', 'CP-2026-0003', 'paga', 10))$q$,
  'compras_status_valido', '6 status fora da lista');
rollback to savepoint c6;
savepoint c7;
select pg_temp.recusa($q$update public.compras set status = 'cancelada' where id = 'cmp_g1'$q$,
  'status', '7 coluna gerada gravada direto');
rollback to savepoint c7;
savepoint c8;
select pg_temp.recusa($q$insert into public.compras (id, dados) values ('cmp_g4', pg_temp.compra('outro_id', 'CP-2026-0004', 'aguardando', 10))$q$,
  'compras_id_do_documento', '8 id diferente do documento');
rollback to savepoint c8;
reset role;

-- ── 9. trilha ──
do $$
begin
  if (select count(*) from public.audit_log where entidade = 'compras' and entidade_id = 'cmp_g1') < 2 then
    raise exception 'CASO 9 FALHOU: criar e aprovar a compra não deixaram dois eventos na trilha.';
  end if;
end $$;

-- ── 2 e 3. leitor lê, não grava, não apaga ──
select pg_temp.como('c1000000-0000-0000-0000-000000000002');
set local role authenticated;
do $$
begin
  if (select count(*) from public.compras where id = 'cmp_g1') <> 1 then
    raise exception 'CASO 2 FALHOU: o LEITOR deixou de ler as compras da empresa.';
  end if;
end $$;
savepoint c2;
select pg_temp.recusa($q$insert into public.compras (id, dados) values ('cmp_g5', pg_temp.compra('cmp_g5', 'CP-2026-0005', 'aguardando', 10))$q$,
  'compras_escrita_exige_papel', '2 leitor grava');
rollback to savepoint c2;
savepoint c3;
select pg_temp.recusa($q$select public.excluir_logico('compras', 'cmp_g1', 'leitor tentando')$q$,
  'não exclui registros', '3 leitor exclui');
rollback to savepoint c3;
reset role;

-- ── 3. o titular não apaga direto; exclui pela lixeira e restaura ──
select pg_temp.como('c1000000-0000-0000-0000-000000000001');
set local role authenticated;
savepoint c3b;
select pg_temp.recusa($q$delete from public.compras where id = 'cmp_g1'$q$,
  'permission denied', '3 exclusão física');
rollback to savepoint c3b;
select public.excluir_logico('compras', 'cmp_g1', 'guarda');
do $$
begin
  if exists (select 1 from public.compras where id = 'cmp_g1') then
    raise exception 'CASO 3 FALHOU: a compra na lixeira continua aparecendo na leitura.';
  end if;
  if not exists (select 1 from public.lixeira_listar(1) where entidade = 'compras' and id = 'cmp_g1' and resumo like 'Compra CP-2026-0001%') then
    raise exception 'CASO 3 FALHOU: a compra excluída não aparece na lixeira com o número.';
  end if;
end $$;
select public.restaurar_logico('compras', 'cmp_g1');
do $$
begin
  if not exists (select 1 from public.compras where id = 'cmp_g1') then
    raise exception 'CASO 3 FALHOU: restaurar não devolveu a compra.';
  end if;
end $$;
reset role;

-- ── 4. a empresa B não lê a compra de A ──
select pg_temp.como('c1000000-0000-0000-0000-000000000003');
set local role authenticated;
do $$
begin
  if (select count(*) from public.compras) <> 0 then
    raise exception 'CASO 4 FALHOU: a empresa B leu compras de outra empresa.';
  end if;
end $$;
reset role;

-- ── 10. a cópia de org_state, e reaplicar não duplica ──
insert into public.org_state (org_id, chave, valor) values (
  current_setting('guarda.org_b')::uuid, 'a4p_compras',
  jsonb_build_array(
    pg_temp.compra('cmp_antiga', 'CP-2026-0009', 'aguardando', 99.9),
    jsonb_build_object('id', 'cmp_quebrada', 'numero', 'CP-2026-0010', 'status', 'paga', 'valor', 1)
  ))
on conflict (org_id, chave) do update set valor = excluded.valor;
\i supabase/migrations/20261103200000_compras_morada_unica.sql
do $$
declare n int;
begin
  select count(*) into n from public.compras where org_id = current_setting('guarda.org_b')::uuid;
  if n <> 1 or not exists (select 1 from public.compras where id = 'cmp_antiga' and valor = 99.9) then
    raise exception 'CASO 10 FALHOU: a cópia de org_state trouxe % linhas (esperado: só a compra válida).', n;
  end if;
  perform set_config('guarda.antes', (select count(*) from public.compras)::text, true);
end $$;
\i supabase/migrations/20261103200000_compras_morada_unica.sql
do $$
begin
  if (select count(*) from public.compras)::text <> current_setting('guarda.antes') then
    raise exception 'CASO 10 FALHOU: reaplicar a migration criou linhas novas.';
  end if;
  raise notice 'compras: 10 casos verdes';
end $$;

rollback;
