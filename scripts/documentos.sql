-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA DAS TABELAS DE DOCUMENTOS — a forma comum das `*_morada_unica`
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -v tabela=contratos \
--        -v chave=a4p_contratos -v doc='{"lado":"cliente","valor":10}' \
--        -f scripts/documentos.sql
--
-- `tabela` é a tabela, `chave` a chave antiga de org_state e `doc` um
-- documento VÁLIDO sem `id` (a guarda põe o id). Para cada tabela, prova:
--
--   1. o titular grava na empresa aberta, e a trilha registra;
--   2. o LEITOR lê e é recusado ao gravar (a mesma exigência de org_state);
--   3. ninguém apaga direto; o leitor não exclui; o titular exclui pela
--      lixeira (some da leitura) e restaura;
--   4. a empresa B não lê o item de A;
--   5. o id da linha tem de ser o id do documento;
--   6. a cópia de org_state traz o item e reaplicar a migration não duplica.
--
-- ⚠️ O arreio é o de `compras.sql` (que veio de `papel-dinheiro.sql`). Cada
-- recusa tem de NOMEAR o motivo. Termina em ROLLBACK.
-- ═══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

begin;

select set_config('guarda.tabela', :'tabela', true),
       set_config('guarda.chave', :'chave', true),
       set_config('guarda.doc', :'doc', true);

insert into auth.users (id, email) values
  ('d1000000-0000-0000-0000-000000000001', 'titular.docs@guarda.test'),
  ('d1000000-0000-0000-0000-000000000002', 'leitor.docs@guarda.test'),
  ('d1000000-0000-0000-0000-000000000003', 'titular-b.docs@guarda.test');

do $$
declare
  v_org uuid;
  v_org_b uuid;
begin
  select org_id into v_org from public.organization_members
   where user_id = 'd1000000-0000-0000-0000-000000000001';
  select org_id into v_org_b from public.organization_members
   where user_id = 'd1000000-0000-0000-0000-000000000003';
  if v_org is null or v_org_b is null or v_org = v_org_b then
    raise exception 'GUARDA INVÁLIDA: o provisionamento não criou duas empresas. Nada abaixo prova coisa alguma.';
  end if;
  if to_regclass('public.' || current_setting('guarda.tabela')) is null then
    raise exception 'GUARDA INVÁLIDA: a tabela % não existe.', current_setting('guarda.tabela');
  end if;
  insert into public.organization_members (org_id, user_id, role) values
    (v_org, 'd1000000-0000-0000-0000-000000000002', 'leitor');
  insert into public.user_active_org (user_id, org_id) values
    ('d1000000-0000-0000-0000-000000000002', v_org)
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
    raise exception '[%] CASO % FALHOU: a operação PASSOU.', current_setting('guarda.tabela'), caso;
  end if;
  if v_msg not like '%' || motivo || '%' then
    raise exception '[%] VERMELHO PELO MOTIVO ERRADO no caso %: "%" não cita %.', current_setting('guarda.tabela'), caso, v_msg, motivo;
  end if;
end $$;

-- insert de um documento com id, na tabela da guarda
create or replace function pg_temp.inserir_sql(id text, id_doc text) returns text language sql as $$
  select format('insert into public.%I (id, dados) values (%L, %L::jsonb)',
    current_setting('guarda.tabela'), id,
    (current_setting('guarda.doc')::jsonb || jsonb_build_object('id', id_doc))::text)
$$;

create or replace function pg_temp.conta(id text) returns int language plpgsql as $$
declare n int;
begin
  execute format('select count(*) from public.%I where id = %L', current_setting('guarda.tabela'), id) into n;
  return n;
end $$;

-- ── 1. titular grava na empresa aberta; trilha ──
select pg_temp.como('d1000000-0000-0000-0000-000000000001');
set local role authenticated;
do $$
declare v_org uuid;
begin
  execute pg_temp.inserir_sql('doc_g1', 'doc_g1');
  execute format('select org_id from public.%I where id = %L', current_setting('guarda.tabela'), 'doc_g1') into v_org;
  if v_org is distinct from current_setting('guarda.org')::uuid then
    raise exception '[%] CASO 1 FALHOU: o item não nasceu na empresa aberta (org_id %).', current_setting('guarda.tabela'), v_org;
  end if;
end $$;

-- ── 5. id da linha = id do documento ──
savepoint c5;
select pg_temp.recusa(pg_temp.inserir_sql('doc_g2', 'outro_id'), current_setting('guarda.tabela') || '_id_do_documento', '5 id diferente do documento');
rollback to savepoint c5;
reset role;

do $$
begin
  if (select count(*) from public.audit_log where entidade = current_setting('guarda.tabela') and entidade_id = 'doc_g1') < 1 then
    raise exception '[%] CASO 1 FALHOU: gravar não deixou evento na trilha.', current_setting('guarda.tabela');
  end if;
end $$;

-- ── 2 e 3. leitor lê, não grava, não exclui ──
select pg_temp.como('d1000000-0000-0000-0000-000000000002');
set local role authenticated;
do $$
begin
  if pg_temp.conta('doc_g1') <> 1 then
    raise exception '[%] CASO 2 FALHOU: o LEITOR deixou de ler os itens da empresa.', current_setting('guarda.tabela');
  end if;
end $$;
savepoint c2;
select pg_temp.recusa(pg_temp.inserir_sql('doc_g3', 'doc_g3'), current_setting('guarda.tabela') || '_escrita_exige_papel', '2 leitor grava');
rollback to savepoint c2;
savepoint c3;
select pg_temp.recusa(format($q$select public.excluir_logico(%L, 'doc_g1', 'leitor tentando')$q$, current_setting('guarda.tabela')),
  'não exclui registros', '3 leitor exclui');
rollback to savepoint c3;
reset role;

-- ── 3. titular: sem exclusão física; lixeira e restauração ──
select pg_temp.como('d1000000-0000-0000-0000-000000000001');
set local role authenticated;
savepoint c3b;
select pg_temp.recusa(format('delete from public.%I where id = %L', current_setting('guarda.tabela'), 'doc_g1'),
  'permission denied', '3 exclusão física');
rollback to savepoint c3b;
select public.excluir_logico(current_setting('guarda.tabela'), 'doc_g1', 'guarda');
do $$
begin
  if pg_temp.conta('doc_g1') <> 0 then
    raise exception '[%] CASO 3 FALHOU: o item na lixeira continua aparecendo na leitura.', current_setting('guarda.tabela');
  end if;
  if not exists (select 1 from public.lixeira_listar(1) where entidade = current_setting('guarda.tabela') and id = 'doc_g1') then
    raise exception '[%] CASO 3 FALHOU: o item excluído não aparece na lixeira.', current_setting('guarda.tabela');
  end if;
end $$;
select public.restaurar_logico(current_setting('guarda.tabela'), 'doc_g1');
do $$
begin
  if pg_temp.conta('doc_g1') <> 1 then
    raise exception '[%] CASO 3 FALHOU: restaurar não devolveu o item.', current_setting('guarda.tabela');
  end if;
end $$;
reset role;

-- ── 4. a empresa B não lê o item de A ──
select pg_temp.como('d1000000-0000-0000-0000-000000000003');
set local role authenticated;
do $$
declare n int;
begin
  execute format('select count(*) from public.%I', current_setting('guarda.tabela')) into n;
  if n <> 0 then
    raise exception '[%] CASO 4 FALHOU: a empresa B leu itens de outra empresa.', current_setting('guarda.tabela');
  end if;
end $$;
reset role;

-- ── 6. a cópia de org_state, e reaplicar não duplica ──
insert into public.org_state (org_id, chave, valor) values (
  current_setting('guarda.org_b')::uuid, current_setting('guarda.chave'),
  jsonb_build_array(current_setting('guarda.doc')::jsonb || jsonb_build_object('id', 'doc_antigo')))
on conflict (org_id, chave) do update set valor = excluded.valor;
select set_config('guarda.migration', (
  select 'supabase/migrations/' || m from (values
    ('contratos', '20261103210000_contratos_morada_unica.sql'),
    ('colaboradores', '20261103220000_colaboradores_morada_unica.sql')) v(t, m)
   where t = current_setting('guarda.tabela')), true) as migration \gset
\i :migration
do $$
declare n int;
begin
  execute format('select count(*) from public.%I where org_id = %L and id = %L',
    current_setting('guarda.tabela'), current_setting('guarda.org_b'), 'doc_antigo') into n;
  if n <> 1 then
    raise exception '[%] CASO 6 FALHOU: a cópia de org_state trouxe % linhas (esperado: 1).', current_setting('guarda.tabela'), n;
  end if;
  execute format('select count(*) from public.%I', current_setting('guarda.tabela')) into n;
  perform set_config('guarda.antes', n::text, true);
end $$;
\i :migration
do $$
declare n int;
begin
  execute format('select count(*) from public.%I', current_setting('guarda.tabela')) into n;
  if n::text <> current_setting('guarda.antes') then
    raise exception '[%] CASO 6 FALHOU: reaplicar a migration criou linhas novas.', current_setting('guarda.tabela');
  end if;
  raise notice 'documentos[%]: 6 casos verdes', current_setting('guarda.tabela');
end $$;

rollback;
