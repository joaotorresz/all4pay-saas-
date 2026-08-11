-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA: A ÁRVORE DO PLANO DE CONTAS E A CHAVE DO CATÁLOGO
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/taxonomia.sql
--
-- ⚠️ Roda contra um banco construído do ZERO pelas migrations, no mesmo job das
-- guardas de isolamento e da trilha. É a diferença entre "escrevi um gatilho" e
-- "o gatilho está no banco que o deploy produz": um `create trigger` que ficou
-- só no remoto porque alguém aplicou à mão some no primeiro `db reset`, e
-- ninguém descobre até a primeira despesa entrar dentro de uma receita.
--
-- ⚠️ Cada caso é conferido pelo ERRCODE (`A4P05`), nunca por `when others`. O
-- primeiro teste que escrevi capturava qualquer exceção e reportava sucesso —
-- e passou enquanto o gatilho morria com 42883 por comparar enum com text.
-- Um teste que aceita qualquer falha como sucesso não testa nada.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

-- ⚠️ A TRANSAÇÃO EXPLÍCITA É OBRIGATÓRIA, e a falta dela quase passou. Sem
-- `begin;` o psql roda em autocommit: o bloco DO comita, e o `rollback` do fim
-- só emite um aviso de "nenhuma transação em andamento". A guarda deixaria
-- organização, conta, categorias, produtos e lançamentos de teste no banco — e
-- uma guarda de HIGIENE que suja o banco é a piada que ela existe para evitar.
-- A próxima execução ainda mediria a sujeira criada pela anterior.
begin;

do $guarda$
declare
  v_org uuid;
  v_pai uuid;
  v_conta uuid;
  falhas text[] := '{}';
  add_falha text;
begin
  insert into public.organizations (name) values ('Guarda Taxonomia') returning id into v_org;
  -- ⚠️ `bank` é NOT NULL. Contra o remoto eu reaproveitei uma conta existente e
  -- não vi; contra um banco do ZERO — que é o que esta guarda existe para
  -- exercer — a fixture precisa criar a sua, e obedecer ao schema inteiro.
  insert into public.financial_accounts (org_id, name, bank, balance)
    values (v_org, 'Conta guarda', 'inter', 0) returning id into v_conta;

  /* -- 1. Despesa NÃO pode ser filha de receita -------------------------- */
  insert into public.categories (org_id, kind, name)
    values (v_org, 'receita', 'Grupo de receita') returning id into v_pai;
  begin
    insert into public.categories (org_id, kind, name, parent_id)
      values (v_org, 'despesa', 'Despesa infiltrada', v_pai);
    falhas := falhas || 'despesa entrou dentro de grupo de receita';
  exception
    when sqlstate 'A4P05' then null;
    when others then falhas := falhas || ('árvore recusou pelo motivo errado: ' || sqlstate);
  end;

  /* -- 2. Mesma natureza PASSA (a guarda não pode reprovar o certo) ------ */
  begin
    insert into public.categories (org_id, kind, name, parent_id)
      values (v_org, 'receita', 'Subcategoria legítima', v_pai);
  exception when others then
    falhas := falhas || ('árvore reprovou uma subcategoria válida: ' || sqlstate);
  end;

  /* -- 3. O PAI não muda de natureza deixando filhos divergentes --------- */
  begin
    update public.categories set kind = 'despesa' where id = v_pai;
    falhas := falhas || 'o grupo trocou de natureza deixando filhos divergentes';
  exception
    when sqlstate 'A4P05' then null;
    when others then falhas := falhas || ('troca de natureza recusada pelo motivo errado: ' || sqlstate);
  end;

  /* -- 4. Código de produto é ÚNICO, ignorando caixa e espaço ------------ */
  insert into public.products (org_id, name, sku) values (v_org, 'Produto A', 'ABC-1');
  begin
    insert into public.products (org_id, name, sku) values (v_org, 'Produto B', ' abc-1 ');
    falhas := falhas || 'dois produtos com o mesmo código foram aceitos';
  exception
    when unique_violation then null;
    when others then falhas := falhas || ('código duplicado recusado pelo motivo errado: ' || sqlstate);
  end;

  /* -- 5. Código VAZIO não compete por unicidade ------------------------- */
  begin
    insert into public.products (org_id, name, sku) values (v_org, 'Sem código 1', null);
    insert into public.products (org_id, name, sku) values (v_org, 'Sem código 2', null);
  exception when others then
    falhas := falhas || ('produtos sem código foram bloqueados entre si: ' || sqlstate);
  end;

  /* -- 6. Título EXIGE origem ------------------------------------------- */
  begin
    insert into public.movements (org_id, account_id, type, status, amount, due_date)
      values (v_org, v_conta, 'entrada', 'pendente', 100, current_date);
    falhas := falhas || 'título sem origem foi aceito';
  exception
    when sqlstate 'A4P05' then null;
    when others then falhas := falhas || ('título sem origem recusado pelo motivo errado: ' || sqlstate);
  end;

  /* -- 7. Extrato NÃO é título ------------------------------------------ */
  begin
    insert into public.movements (org_id, account_id, type, status, amount, due_date, origem)
      values (v_org, v_conta, 'entrada', 'pendente', 100, current_date, 'extrato');
    falhas := falhas || 'um lançamento de extrato foi aceito como título';
  exception
    when sqlstate 'A4P05' then null;
    when others then falhas := falhas || ('extrato-como-título recusado pelo motivo errado: ' || sqlstate);
  end;

  /* -- 8. Título com origem válida PASSA --------------------------------- */
  begin
    insert into public.movements (org_id, account_id, type, status, amount, due_date, origem)
      values (v_org, v_conta, 'entrada', 'pendente', 100, current_date, 'venda');
  exception when others then
    falhas := falhas || ('título com origem legítima foi reprovado: ' || sqlstate);
  end;

  /* -- 9. Espécie extrato entra e ganha a própria origem ------------------ */
  begin
    insert into public.movements (org_id, account_id, type, status, amount, due_date, especie)
      values (v_org, v_conta, 'saida', 'pago', 50, current_date, 'extrato');
  exception when others then
    falhas := falhas || ('lançamento de extrato foi reprovado: ' || sqlstate);
  end;

  if array_length(falhas, 1) > 0 then
    -- ⚠️ SENTINELA, pelo mesmo motivo do `[A4P-VAZAMENTO]`: é por ela que o
    -- runner distingue "o banco aceitou o que devia recusar" de "a fixture nem
    -- montou". Sem isso, um `bank` NOT NULL esquecido é anunciado como falha
    -- de taxonomia — e quem lê procura o defeito no lugar errado.
    raise exception E'[A4P-TAXONOMIA] GUARDA DE TAXONOMIA REPROVOU:\n  - %',
      array_to_string(falhas, E'\n  - ');
  end if;

  raise notice 'guarda de taxonomia: 9 casos, 0 falhas';
end $guarda$;

-- ⚠️ ROLLBACK: fecha o `begin;` do topo e descarta tudo que a guarda criou. É
-- o que a torna segura contra qualquer banco, inclusive produção.
rollback;
