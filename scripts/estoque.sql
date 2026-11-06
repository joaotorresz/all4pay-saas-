-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA DO ESTOQUE — movimentos e saldo (migration 20261104190000)
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/estoque.sql
--
-- O saldo é UMA conta no banco (view `estoque_saldos`):
--   inicial (cadastro) + entradas − saídas (movimentos) − vendido (sale_items).
-- Esta guarda prova, no banco construído do zero pelas migrations:
--
--   1. entrada e saída mexem no saldo; o custo médio pondera o inicial e as
--      entradas com custo;
--   2. a venda tira do estoque; orçamento e venda de demonstração não tiram;
--   3. editar a venda (item velho na lixeira, item novo) acerta o saldo
--      sozinho, sem estorno a lembrar;
--   4. cancelar a venda devolve o estoque;
--   5. movimento na lixeira sai do saldo; restaurar devolve;
--   6. o banco recusa: produto que não controla estoque, produto de outra
--      empresa, quantidade zero, custo na saída, motivo vazio, tipo fora da
--      lista, editar e apagar movimento;
--   7. o LEITOR lê o saldo e é recusado ao lançar;
--   8. a empresa B não vê movimento nem saldo da A;
--   9. lançar deixa evento na trilha;
--  10. sem nenhum custo, o custo médio fica VAZIO, nunca zero;
--  11. a entrada da NF-e soma no saldo; a mesma chave + item é recusada; na
--      lixeira, o item pode entrar de novo (migration 20261105230000);
--  12. a origem amarra a chave: nota sem chave, chave em movimento manual,
--      nota que tira do estoque e chave mal formada são recusadas;
--  13. o vínculo do fornecedor: um código, um produto (o upsert substitui);
--      produto de outra empresa e fator zero recusados; o leitor não grava;
--      a empresa B não vê.
--
-- ⚠️ Os saldos esperados são NÚMEROS LITERAIS escritos aqui (regra 11): a
-- guarda não reaproveita a conta da view que ela audita.
-- ⚠️ O arreio é o de `compras.sql`, copiado. Cada recusa tem de NOMEAR a
-- restrição; recusa por outro motivo reprova. Termina em ROLLBACK.
-- ═══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('e5000000-0000-0000-0000-000000000001', 'titular.estoque@guarda.test'),
  ('e5000000-0000-0000-0000-000000000002', 'leitor.estoque@guarda.test'),
  ('e5000000-0000-0000-0000-000000000003', 'titular-b.estoque@guarda.test');

do $$
declare
  v_org uuid;
  v_org_b uuid;
begin
  select org_id into v_org from public.organization_members
   where user_id = 'e5000000-0000-0000-0000-000000000001';
  select org_id into v_org_b from public.organization_members
   where user_id = 'e5000000-0000-0000-0000-000000000003';
  if v_org is null or v_org_b is null or v_org = v_org_b then
    raise exception 'GUARDA INVÁLIDA: o provisionamento não criou duas empresas. Nada abaixo prova coisa alguma.';
  end if;
  insert into public.organization_members (org_id, user_id, role) values
    (v_org, 'e5000000-0000-0000-0000-000000000002', 'leitor');
  insert into public.user_active_org (user_id, org_id) values
    ('e5000000-0000-0000-0000-000000000002', v_org)
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

-- O saldo de um produto, lido da view com o papel de quem pergunta.
create or replace function pg_temp.saldo(p uuid) returns numeric language sql as $$
  select saldo from public.estoque_saldos where product_id = p
$$;

create or replace function pg_temp.confere(p uuid, esperado numeric, caso text) returns void language plpgsql as $$
declare v numeric := pg_temp.saldo(p);
begin
  if v is distinct from esperado then
    raise exception 'CASO % FALHOU: saldo %, esperado %.', caso, coalesce(v::text, 'vazio'), esperado;
  end if;
end $$;

-- ── Produtos e venda da empresa A (titular) ──
select pg_temp.como('e5000000-0000-0000-0000-000000000001');
set local role authenticated;
insert into public.products (id, name, sku, sale_price, cost_price, track_stock, stock_initial) values
  ('e5100000-0000-0000-0000-000000000001', 'Caneca da guarda', 'CAN-G', 50, 18, true, 10),
  ('e5100000-0000-0000-0000-000000000002', 'Serviço sem estoque', 'SRV-G', 80, null, false, null),
  ('e5100000-0000-0000-0000-000000000003', 'Camiseta sem custo', 'CAM-G', 40, null, true, 4);

-- ── 1. entrada e saída mexem no saldo; custo médio ──
insert into public.estoque_movimentos (id, product_id, tipo, quantidade, custo_unitario, motivo) values
  ('e5200000-0000-0000-0000-000000000001', 'e5100000-0000-0000-0000-000000000001', 'entrada', 5, 20, 'Compra'),
  ('e5200000-0000-0000-0000-000000000002', 'e5100000-0000-0000-0000-000000000001', 'saida', 2, null, 'Perda ou avaria');
-- 10 + 5 − 2 = 13
select pg_temp.confere('e5100000-0000-0000-0000-000000000001', 13, '1 entrada e saída');
do $$
declare r record;
begin
  select org_id, custo_medio into r from public.estoque_saldos where product_id = 'e5100000-0000-0000-0000-000000000001';
  if r.org_id is distinct from current_setting('guarda.org')::uuid then
    raise exception 'CASO 1 FALHOU: o saldo não está na empresa aberta (org_id %).', r.org_id;
  end if;
  -- (10 × 18 + 5 × 20) ÷ 15 = 18,6667
  if r.custo_medio is distinct from 18.6667 then
    raise exception 'CASO 1 FALHOU: custo médio %, esperado 18,6667.', r.custo_medio;
  end if;
  if exists (select 1 from public.estoque_saldos where product_id = 'e5100000-0000-0000-0000-000000000002') then
    raise exception 'CASO 1 FALHOU: produto que não controla estoque apareceu no saldo.';
  end if;
end $$;

-- ── 2. a venda tira; orçamento e demonstração não ──
insert into public.sales_docs (id, kind, item_kind, doc_date, total, status) values
  ('e5300000-0000-0000-0000-000000000001', 'venda', 'produto', '2026-11-04', 150, 'aprovada'),
  ('e5300000-0000-0000-0000-000000000002', 'orcamento', 'produto', '2026-11-04', 200, 'orcamento');
insert into public.sales_docs (id, kind, item_kind, doc_date, total, status, is_sample, sample_reason) values
  ('e5300000-0000-0000-0000-000000000003', 'venda', 'produto', '2026-11-04', 50, 'completa', true, 'onboarding_demo');
insert into public.sale_items (id, doc_id, product_id, description, qty, unit_price, total) values
  ('e5400000-0000-0000-0000-000000000001', 'e5300000-0000-0000-0000-000000000001', 'e5100000-0000-0000-0000-000000000001', 'Caneca', 3, 50, 150),
  ('e5400000-0000-0000-0000-000000000002', 'e5300000-0000-0000-0000-000000000002', 'e5100000-0000-0000-0000-000000000001', 'Caneca', 4, 50, 200);
insert into public.sale_items (id, doc_id, product_id, description, qty, unit_price, total, is_sample, sample_reason) values
  ('e5400000-0000-0000-0000-000000000003', 'e5300000-0000-0000-0000-000000000003', 'e5100000-0000-0000-0000-000000000001', 'Caneca', 1, 50, 50, true, 'onboarding_demo');
-- 13 − 3 = 10 (o orçamento de 4 e a venda de demonstração de 1 não contam)
select pg_temp.confere('e5100000-0000-0000-0000-000000000001', 10, '2 venda tira, orçamento e demonstração não');

-- ── 3. editar a venda: o item velho vai para a lixeira, o novo entra ──
select public.excluir_logico('sale_items', 'e5400000-0000-0000-0000-000000000001', 'item substituído na edição da venda');
insert into public.sale_items (id, doc_id, product_id, description, qty, unit_price, total) values
  ('e5400000-0000-0000-0000-000000000004', 'e5300000-0000-0000-0000-000000000001', 'e5100000-0000-0000-0000-000000000001', 'Caneca', 1, 50, 50);
-- 13 − 1 = 12
select pg_temp.confere('e5100000-0000-0000-0000-000000000001', 12, '3 edição da venda');

-- ── 4. cancelar a venda devolve ──
update public.sales_docs set status = 'cancelada' where id = 'e5300000-0000-0000-0000-000000000001';
select pg_temp.confere('e5100000-0000-0000-0000-000000000001', 13, '4 venda cancelada');

-- ── 5. movimento na lixeira sai do saldo; restaurar devolve ──
select public.excluir_logico('estoque_movimentos', 'e5200000-0000-0000-0000-000000000002', 'lançada por engano');
select pg_temp.confere('e5100000-0000-0000-0000-000000000001', 15, '5 saída na lixeira');
do $$
begin
  if not exists (select 1 from public.lixeira_listar(1) where entidade = 'estoque_movimentos'
                   and id = 'e5200000-0000-0000-0000-000000000002' and resumo like 'Saída de estoque%') then
    raise exception 'CASO 5 FALHOU: o movimento excluído não aparece na lixeira com o que ele era.';
  end if;
end $$;
select public.restaurar_logico('estoque_movimentos', 'e5200000-0000-0000-0000-000000000002');
select pg_temp.confere('e5100000-0000-0000-0000-000000000001', 13, '5 restaurado');

-- ── 6. o banco recusa ──
savepoint c6a;
select pg_temp.recusa($q$insert into public.estoque_movimentos (product_id, tipo, quantidade, motivo) values ('e5100000-0000-0000-0000-000000000002', 'entrada', 1, 'Compra')$q$,
  'estoque_produto_controla', '6 produto sem controle de estoque');
rollback to savepoint c6a;
savepoint c6c;
select pg_temp.recusa($q$insert into public.estoque_movimentos (product_id, tipo, quantidade, motivo) values ('e5100000-0000-0000-0000-000000000001', 'entrada', 0, 'Compra')$q$,
  'estoque_movimentos_quantidade_positiva', '6 quantidade zero');
rollback to savepoint c6c;
savepoint c6d;
select pg_temp.recusa($q$insert into public.estoque_movimentos (product_id, tipo, quantidade, custo_unitario, motivo) values ('e5100000-0000-0000-0000-000000000001', 'saida', 1, 10, 'Perda')$q$,
  'estoque_movimentos_custo_so_na_entrada', '6 custo na saída');
rollback to savepoint c6d;
savepoint c6e;
select pg_temp.recusa($q$insert into public.estoque_movimentos (product_id, tipo, quantidade, motivo) values ('e5100000-0000-0000-0000-000000000001', 'entrada', 1, '  ')$q$,
  'estoque_movimentos_motivo_preenchido', '6 motivo vazio');
rollback to savepoint c6e;
savepoint c6f;
select pg_temp.recusa($q$insert into public.estoque_movimentos (product_id, tipo, quantidade, motivo) values ('e5100000-0000-0000-0000-000000000001', 'ajuste', 1, 'Inventário')$q$,
  'estoque_movimentos_tipo_valido', '6 tipo fora da lista');
rollback to savepoint c6f;
savepoint c6g;
select pg_temp.recusa($q$update public.estoque_movimentos set quantidade = 50 where id = 'e5200000-0000-0000-0000-000000000001'$q$,
  'permission denied', '6 editar movimento');
rollback to savepoint c6g;
savepoint c6h;
select pg_temp.recusa($q$delete from public.estoque_movimentos where id = 'e5200000-0000-0000-0000-000000000001'$q$,
  'permission denied', '6 apagar movimento');
rollback to savepoint c6h;
reset role;

-- Produto da empresa B: a A tenta lançar nele.
select pg_temp.como('e5000000-0000-0000-0000-000000000003');
set local role authenticated;
insert into public.products (id, name, sale_price, track_stock, stock_initial) values
  ('e5100000-0000-0000-0000-0000000000b1', 'Produto da empresa B', 10, true, 7);
reset role;
select pg_temp.como('e5000000-0000-0000-0000-000000000001');
set local role authenticated;
savepoint c6b;
select pg_temp.recusa($q$insert into public.estoque_movimentos (product_id, tipo, quantidade, motivo) values ('e5100000-0000-0000-0000-0000000000b1', 'saida', 1, 'Perda')$q$,
  'estoque_produto_da_empresa', '6 produto de outra empresa');
rollback to savepoint c6b;

-- ── 10. sem custo nenhum, o custo médio fica vazio ──
insert into public.estoque_movimentos (product_id, tipo, quantidade, motivo) values
  ('e5100000-0000-0000-0000-000000000003', 'entrada', 2, 'Devolução de cliente');
do $$
declare r record;
begin
  select saldo, custo_medio into r from public.estoque_saldos where product_id = 'e5100000-0000-0000-0000-000000000003';
  if r.saldo is distinct from 6.000 then
    raise exception 'CASO 10 FALHOU: saldo %, esperado 6.', r.saldo;
  end if;
  if r.custo_medio is not null then
    raise exception 'CASO 10 FALHOU: sem custo nenhum, o custo médio virou % (tem de ficar vazio).', r.custo_medio;
  end if;
end $$;

-- ── 11. entrada pela NF-e (migration 20261105230000) ──
-- A nota entra com a chave e o item; a mesma chave + item não entra duas vezes;
-- na lixeira, o item fica livre para entrar de novo.
insert into public.estoque_movimentos (id, product_id, tipo, quantidade, custo_unitario, motivo, origem, nfe_chave, nfe_item, fornecedor_cnpj) values
  ('e5200000-0000-0000-0000-0000000000f1', 'e5100000-0000-0000-0000-000000000003', 'entrada', 24, 7.5, 'Compra · NF-e 1234', 'nfe', '35261112345678000190550010000012341000012345', 1, '12345678000190');
-- 6 + 24 = 30
select pg_temp.confere('e5100000-0000-0000-0000-000000000003', 30, '11 entrada da nota');
savepoint c11a;
select pg_temp.recusa($q$insert into public.estoque_movimentos (product_id, tipo, quantidade, motivo, origem, nfe_chave, nfe_item) values ('e5100000-0000-0000-0000-000000000003', 'entrada', 24, 'Compra · NF-e 1234', 'nfe', '35261112345678000190550010000012341000012345', 1)$q$,
  'estoque_movimentos_nfe_unica', '11 a mesma nota de novo');
rollback to savepoint c11a;
-- o item 2 da mesma nota entra
insert into public.estoque_movimentos (product_id, tipo, quantidade, motivo, origem, nfe_chave, nfe_item) values
  ('e5100000-0000-0000-0000-000000000003', 'entrada', 1, 'Compra · NF-e 1234', 'nfe', '35261112345678000190550010000012341000012345', 2);
select pg_temp.confere('e5100000-0000-0000-0000-000000000003', 31, '11 outro item da mesma nota');
select public.excluir_logico('estoque_movimentos', 'e5200000-0000-0000-0000-0000000000f1', 'produto errado na conferência');
insert into public.estoque_movimentos (product_id, tipo, quantidade, motivo, origem, nfe_chave, nfe_item) values
  ('e5100000-0000-0000-0000-000000000003', 'entrada', 2, 'Compra · NF-e 1234', 'nfe', '35261112345678000190550010000012341000012345', 1);
-- 6 + 1 + 2 = 9
select pg_temp.confere('e5100000-0000-0000-0000-000000000003', 9, '11 item reimportado depois da lixeira');

-- ── 12. a origem amarra a chave ──
savepoint c12a;
select pg_temp.recusa($q$insert into public.estoque_movimentos (product_id, tipo, quantidade, motivo, origem) values ('e5100000-0000-0000-0000-000000000003', 'entrada', 1, 'Compra', 'nfe')$q$,
  'estoque_movimentos_nfe_completa', '12 nota sem chave');
rollback to savepoint c12a;
savepoint c12b;
select pg_temp.recusa($q$insert into public.estoque_movimentos (product_id, tipo, quantidade, motivo, nfe_chave, nfe_item) values ('e5100000-0000-0000-0000-000000000003', 'entrada', 1, 'Compra', '35261112345678000190550010000012341000012345', 9)$q$,
  'estoque_movimentos_nfe_completa', '12 chave em movimento manual');
rollback to savepoint c12b;
savepoint c12c;
select pg_temp.recusa($q$insert into public.estoque_movimentos (product_id, tipo, quantidade, motivo, origem, nfe_chave, nfe_item) values ('e5100000-0000-0000-0000-000000000003', 'saida', 1, 'Compra', 'nfe', '35261112345678000190550010000012341000012345', 9)$q$,
  'estoque_movimentos_nfe_completa', '12 nota que tira do estoque');
rollback to savepoint c12c;
savepoint c12d;
select pg_temp.recusa($q$insert into public.estoque_movimentos (product_id, tipo, quantidade, motivo, origem, nfe_chave, nfe_item) values ('e5100000-0000-0000-0000-000000000003', 'entrada', 1, 'Compra', 'nfe', '3526111234567800019055001000001234100001234', 9)$q$,
  'estoque_movimentos_nfe_completa', '12 chave com 43 dígitos');
rollback to savepoint c12d;
savepoint c12e;
select pg_temp.recusa($q$insert into public.estoque_movimentos (product_id, tipo, quantidade, motivo, origem) values ('e5100000-0000-0000-0000-000000000003', 'entrada', 1, 'Compra', 'xml')$q$,
  'estoque_movimentos_origem_valida', '12 origem fora da lista');
rollback to savepoint c12e;

-- ── 13. o vínculo do fornecedor ──
insert into public.estoque_vinculos_fornecedor (fornecedor_cnpj, codigo, product_id, fator) values
  ('12345678000190', 'CX-CAM', 'e5100000-0000-0000-0000-000000000003', 12);
insert into public.estoque_vinculos_fornecedor (fornecedor_cnpj, codigo, product_id, fator) values
  ('12345678000190', 'CX-CAM', 'e5100000-0000-0000-0000-000000000001', 6)
on conflict (org_id, fornecedor_cnpj, codigo) do update set product_id = excluded.product_id, fator = excluded.fator;
do $$
begin
  if (select count(*) from public.estoque_vinculos_fornecedor) <> 1
     or (select product_id from public.estoque_vinculos_fornecedor) <> 'e5100000-0000-0000-0000-000000000001'
     or (select fator from public.estoque_vinculos_fornecedor) <> 6 then
    raise exception 'CASO 13 FALHOU: confirmar outro produto para o mesmo código não substituiu o vínculo (um código, um produto).';
  end if;
end $$;
savepoint c13a;
select pg_temp.recusa($q$insert into public.estoque_vinculos_fornecedor (fornecedor_cnpj, codigo, product_id) values ('12345678000190', 'OUTRO', 'e5100000-0000-0000-0000-0000000000b1')$q$,
  'estoque_produto_da_empresa', '13 vínculo com produto de outra empresa');
rollback to savepoint c13a;
savepoint c13b;
select pg_temp.recusa($q$insert into public.estoque_vinculos_fornecedor (fornecedor_cnpj, codigo, product_id, fator) values ('12345678000190', 'Z', 'e5100000-0000-0000-0000-000000000003', 0)$q$,
  'estoque_vinculos_fator_positivo', '13 fator zero');
rollback to savepoint c13b;
reset role;

-- ── 9. trilha ──
do $$
begin
  if not exists (select 1 from public.audit_log where entidade = 'estoque_movimentos'
                   and entidade_id = 'e5200000-0000-0000-0000-000000000001') then
    raise exception 'CASO 9 FALHOU: lançar o movimento não deixou evento na trilha.';
  end if;
end $$;

-- ── 7. leitor lê o saldo, não lança ──
select pg_temp.como('e5000000-0000-0000-0000-000000000002');
set local role authenticated;
select pg_temp.confere('e5100000-0000-0000-0000-000000000001', 13, '7 leitor lê o saldo');
savepoint c7;
select pg_temp.recusa($q$insert into public.estoque_movimentos (product_id, tipo, quantidade, motivo) values ('e5100000-0000-0000-0000-000000000001', 'entrada', 1, 'Compra')$q$,
  'estoque_movimentos_escrita_exige_papel', '7 leitor lança');
rollback to savepoint c7;
savepoint c7b;
select pg_temp.recusa($q$insert into public.estoque_vinculos_fornecedor (fornecedor_cnpj, codigo, product_id) values ('12345678000190', 'L', 'e5100000-0000-0000-0000-000000000003')$q$,
  'estoque_vinculos_escrita_exige_papel', '7 leitor grava vínculo');
rollback to savepoint c7b;
reset role;

-- ── 8. a empresa B não vê a A ──
select pg_temp.como('e5000000-0000-0000-0000-000000000003');
set local role authenticated;
do $$
begin
  if (select count(*) from public.estoque_movimentos) <> 0 then
    raise exception 'CASO 8 FALHOU: a empresa B leu movimentos de outra empresa.';
  end if;
  if (select count(*) from public.estoque_vinculos_fornecedor) <> 0 then
    raise exception 'CASO 8 FALHOU: a empresa B leu vínculos de fornecedor de outra empresa.';
  end if;
  if (select count(*) from public.estoque_saldos) <> 1
     or (select saldo from public.estoque_saldos) is distinct from 7.000 then
    raise exception 'CASO 8 FALHOU: a empresa B não vê só o próprio saldo (esperado: 1 produto com 7).';
  end if;
end $$;
reset role;

do $$ begin raise notice 'estoque: 13 casos verdes'; end $$;

rollback;
