-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA: A HIERARQUIA DOS CADASTROS É REGRA DO BANCO (migration 20260930180000)
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/cadastros-hierarquia.sql
--
-- ⚠️ Os usuários entram por `auth.users` e as empresas nascem do gatilho de
-- signup, COM o seed — a primeira pergunta é se o cadastro de fábrica passa
-- pelas regras novas. Montar a empresa à mão testaria um caminho que nenhum
-- cliente percorre.
--
-- ⚠️ CADA CASO EM SAVEPOINT PRÓPRIO, desfeito no fim, e todos reusando os
-- MESMOS e-mails e nomes de propósito: se um `rollback to savepoint` deixar de
-- acontecer, o caso seguinte colide na hora em vez de passar por acidente.
--
-- ⚠️ Toda recusa é conferida pela MENSAGEM (ou pelo nome da restrição): uma
-- recusa qualquer não prova a regra — o gatilho que morre por outro motivo
-- também "recusa". E o bloco NEGATIVO no fim desliga a trava de folha e exige
-- que a asserção do caso 2 dispare, nomeando o defeito.
--
-- Termina em ROLLBACK: seguro contra qualquer banco.
-- ═══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
begin;

-- ─────────── caso 1: o SEED de uma empresa nova passa pelas regras novas ────
savepoint c1;
do $c1$
declare u uuid := gen_random_uuid(); o uuid; c uuid; cat uuid; n int; t text;
begin
  insert into auth.users (id, email, raw_user_meta_data)
    values (u, 'cad-a@guarda.local', '{"company":"Guarda Cadastros A"}');
  select org_id into o from public.organization_members where user_id = u;
  select id, tipo into c, t from public.financial_accounts where org_id = o limit 1;
  if t is distinct from 'corrente' then
    raise exception 'CASO 1 FALHOU: a conta do seed nasceu com tipo "%", esperado "corrente".', t;
  end if;
  select count(*) into n from public.categories where org_id = o;
  if n < 12 then raise exception 'CASO 1 FALHOU: o seed criou % categorias — o signup não rodou o seed_org.', n; end if;
  select id into cat from public.categories where org_id = o and name = 'Vendas';
  begin
    insert into public.movements (org_id, account_id, type, amount, due_date, origem, category_id)
      values (o, c, 'entrada', 100, current_date, 'manual', cat);
  exception when others then
    raise exception 'CASO 1 FALHOU: lançamento numa categoria do SEED foi recusado: "%"', SQLERRM;
  end;
  raise notice 'caso 1 OK — o seed (% categorias, conta corrente ativa) passa pelas regras novas', n;
end $c1$;
rollback to savepoint c1;

-- ─────────── caso 2: lançamento em GRUPO é recusado; na folha passa ─────────
savepoint c2;
do $c2$
declare u uuid := gen_random_uuid(); o uuid; c uuid; g uuid; f uuid; msg text;
begin
  insert into auth.users (id, email, raw_user_meta_data)
    values (u, 'cad-a@guarda.local', '{"company":"Guarda Cadastros A"}');
  select org_id into o from public.organization_members where user_id = u;
  select id into c from public.financial_accounts where org_id = o limit 1;
  insert into public.categories (org_id, kind, name) values (o, 'despesa', 'Grupo da guarda') returning id into g;
  insert into public.categories (org_id, kind, name, parent_id) values (o, 'despesa', 'Folha da guarda', g) returning id into f;
  begin
    insert into public.movements (org_id, account_id, type, amount, due_date, origem, category_id)
      values (o, c, 'saida', 100, current_date, 'manual', g);
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  if msg is null then
    raise exception 'A4P-CAD-FOLHA: um lançamento foi aceito num GRUPO do plano de contas.';
  end if;
  if msg not like '%é um grupo%' then
    raise exception 'CASO 2 — VERMELHO PELO MOTIVO ERRADO: esperava "é um grupo", veio "%"', msg;
  end if;
  -- rateio e recorrência: a MESMA trava
  begin
    insert into public.recurrences (org_id, type, description, amount, freq, start_date, category_id)
      values (o, 'saida', 'recorrência da guarda', 10, 'mensal', current_date, g);
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  if msg is null or msg not like '%é um grupo%' then
    raise exception 'A4P-CAD-FOLHA: recorrência num GRUPO não foi recusada pelo motivo certo (%).', coalesce(msg, 'aceita');
  end if;
  begin
    insert into public.movements (org_id, account_id, type, amount, due_date, origem, category_id)
      values (o, c, 'saida', 100, current_date, 'manual', f);
  exception when others then
    raise exception 'CASO 2 FALHOU: lançamento na FOLHA foi recusado: "%"', SQLERRM;
  end;
  raise notice 'caso 2 OK — grupo recusa lançamento e recorrência; a folha recebe';
end $c2$;
rollback to savepoint c2;

-- ─────── caso 3: categoria COM lançamento não vira grupo nem vai à lixeira ──
savepoint c3;
do $c3$
declare u uuid := gen_random_uuid(); o uuid; c uuid; cat uuid; g uuid; msg text;
begin
  insert into auth.users (id, email, raw_user_meta_data)
    values (u, 'cad-a@guarda.local', '{"company":"Guarda Cadastros A"}');
  select org_id into o from public.organization_members where user_id = u;
  select id into c from public.financial_accounts where org_id = o limit 1;
  select id into cat from public.categories where org_id = o and name = 'Marketing';
  insert into public.movements (org_id, account_id, type, amount, due_date, origem, category_id)
    values (o, c, 'saida', 70, current_date, 'manual', cat);

  begin
    insert into public.categories (org_id, kind, name, parent_id) values (o, 'despesa', 'Google Ads', cat);
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  if msg is null or msg not like '%não pode virar grupo%' then
    raise exception 'A4P-CAD-VIRA-GRUPO: categoria com lançamento ganhou subcategoria (%).', coalesce(msg, 'aceita');
  end if;

  begin
    update public.categories set excluido_em = now() where id = cat;
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  if msg is null or msg not like '%não pode ir para a lixeira%' then
    raise exception 'A4P-CAD-LIXEIRA: categoria com lançamento foi para a lixeira (%).', coalesce(msg, 'aceita');
  end if;

  -- grupo com subcategoria viva também não vai
  insert into public.categories (org_id, kind, name) values (o, 'despesa', 'Grupo da guarda') returning id into g;
  insert into public.categories (org_id, kind, name, parent_id) values (o, 'despesa', 'Folha da guarda', g);
  begin
    update public.categories set excluido_em = now() where id = g;
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  if msg is null or msg not like '%ainda tem%subcategoria%' then
    raise exception 'A4P-CAD-LIXEIRA: grupo com subcategoria viva foi para a lixeira (%).', coalesce(msg, 'aceito');
  end if;

  -- e o que PODE ir, vai (a guarda não reprova o certo)
  begin
    update public.categories set excluido_em = now() where parent_id = g;
    update public.categories set excluido_em = now() where id = g;
  exception when others then
    raise exception 'CASO 3 FALHOU: folha sem lançamento (e depois o grupo vazio) não foi para a lixeira: "%"', SQLERRM;
  end;
  raise notice 'caso 3 OK — com lançamento não vira grupo nem some; o vazio vai para a lixeira';
end $c3$;
rollback to savepoint c3;

-- ─────────── caso 4: natureza TROCADA não é recusada (é estorno) ────────────
savepoint c4;
do $c4$
declare u uuid := gen_random_uuid(); o uuid; c uuid; cat uuid;
begin
  insert into auth.users (id, email, raw_user_meta_data)
    values (u, 'cad-a@guarda.local', '{"company":"Guarda Cadastros A"}');
  select org_id into o from public.organization_members where user_id = u;
  select id into c from public.financial_accounts where org_id = o limit 1;
  select id into cat from public.categories where org_id = o and name = 'Aluguel';
  begin
    insert into public.movements (org_id, account_id, type, amount, due_date, origem, category_id)
      values (o, c, 'entrada', 30, current_date, 'manual', cat);
  exception when others then
    raise exception 'CASO 4 FALHOU: uma ENTRADA numa categoria de despesa (estorno) foi recusada: "%"', SQLERRM;
  end;
  raise notice 'caso 4 OK — entrada em categoria de despesa passa (o DRE a trata como estorno)';
end $c4$;
rollback to savepoint c4;

-- ─────────── caso 5: conta inativa e projeto encerrado recusam o NOVO ───────
savepoint c5;
do $c5$
declare u uuid := gen_random_uuid(); o uuid; c uuid; p uuid; orig uuid; msg text;
begin
  insert into auth.users (id, email, raw_user_meta_data)
    values (u, 'cad-a@guarda.local', '{"company":"Guarda Cadastros A"}');
  select org_id into o from public.organization_members where user_id = u;
  select id into c from public.financial_accounts where org_id = o limit 1;
  insert into public.movements (org_id, account_id, type, amount, due_date, origem)
    values (o, c, 'saida', 40, current_date, 'manual') returning id into orig;
  update public.financial_accounts set ativo = false where id = c;
  begin
    insert into public.movements (org_id, account_id, type, amount, due_date, origem)
      values (o, c, 'saida', 40, current_date, 'manual');
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  if msg is null or msg not like '%está inativa%' then
    raise exception 'A4P-CAD-CONTA-INATIVA: lançamento novo entrou em conta inativa (%).', coalesce(msg, 'aceito');
  end if;
  -- o ESTORNO de um lançamento antigo passa
  begin
    insert into public.movements (org_id, account_id, type, amount, due_date, origem, estorno_de)
      values (o, c, 'entrada', 40, current_date, 'manual', orig);
  exception when others then
    raise exception 'CASO 5 FALHOU: o estorno de um lançamento antigo foi recusado na conta inativa: "%"', SQLERRM;
  end;
  update public.financial_accounts set ativo = true where id = c;

  insert into public.projects (org_id, name, status) values (o, 'Projeto da guarda', 'encerrado') returning id into p;
  begin
    insert into public.movements (org_id, account_id, type, amount, due_date, origem, project_id)
      values (o, c, 'saida', 40, current_date, 'manual', p);
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  if msg is null or msg not like '%está encerrado%' then
    raise exception 'A4P-CAD-PROJETO-ENCERRADO: lançamento novo entrou em projeto encerrado (%).', coalesce(msg, 'aceito');
  end if;
  update public.projects set status = 'ativo' where id = p;
  begin
    insert into public.movements (org_id, account_id, type, amount, due_date, origem, project_id)
      values (o, c, 'saida', 40, current_date, 'manual', p);
  exception when others then
    raise exception 'CASO 5 FALHOU: projeto ATIVO recusou lançamento: "%"', SQLERRM;
  end;
  raise notice 'caso 5 OK — conta inativa e projeto encerrado recusam o novo; estorno e reativado passam';
end $c5$;
rollback to savepoint c5;

-- ─────────── caso 6: cartão exige os dias; nome de conta é único ───────────
savepoint c6;
do $c6$
declare ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); oa uuid; ob uuid; msg text;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (ua, 'cad-a@guarda.local', '{"company":"Guarda Cadastros A"}'),
    (ub, 'cad-b@guarda.local', '{"company":"Guarda Cadastros B"}');
  select org_id into oa from public.organization_members where user_id = ua;
  select org_id into ob from public.organization_members where user_id = ub;

  begin
    insert into public.financial_accounts (org_id, name, bank, tipo) values (oa, 'Cartão da guarda', 'itau', 'cartao');
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  if msg is null or msg not like '%financial_accounts_dias_do_cartao%' then
    raise exception 'A4P-CAD-CARTAO: cartão sem dias de fatura foi aceito (%).', coalesce(msg, 'aceito');
  end if;
  begin
    insert into public.financial_accounts (org_id, name, bank, tipo, dia_fechamento, dia_vencimento)
      values (oa, 'Cartão da guarda', 'itau', 'cartao', 32, 5);
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  if msg is null or msg not like '%financial_accounts_dias_do_cartao%' then
    raise exception 'A4P-CAD-CARTAO: dia 32 de fechamento foi aceito (%).', coalesce(msg, 'aceito');
  end if;
  begin
    insert into public.financial_accounts (org_id, name, bank, tipo, dia_fechamento, dia_vencimento)
      values (oa, 'Cartão da guarda', 'itau', 'cartao', 20, 28);
  exception when others then
    raise exception 'CASO 6 FALHOU: cartão com os dois dias foi recusado: "%"', SQLERRM;
  end;

  -- o seed já tem "Conta corrente": variação de caixa e espaço é o MESMO nome
  begin
    insert into public.financial_accounts (org_id, name, bank) values (oa, ' conta CORRENTE ', 'inter');
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  if msg is null or msg not like '%financial_accounts_org_nome_unico%' then
    raise exception 'A4P-CAD-NOME-CONTA: duas contas com o mesmo nome na mesma empresa (%).', coalesce(msg, 'aceita');
  end if;
  -- em OUTRA empresa o mesmo nome é legítimo (e já existe pelo seed de B)
  if not exists (select 1 from public.financial_accounts where org_id = ob and lower(name) = 'conta corrente') then
    raise exception 'CASO 6 FALHOU: a empresa B não tem a própria "Conta corrente" do seed.';
  end if;
  raise notice 'caso 6 OK — cartão exige dias válidos; nome de conta único POR empresa';
end $c6$;
rollback to savepoint c6;

-- ─────────── caso 7: documento único POR EMPRESA (não mais global) ──────────
savepoint c7;
do $c7$
declare ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); oa uuid; ob uuid; msg text;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (ua, 'cad-a@guarda.local', '{"company":"Guarda Cadastros A"}'),
    (ub, 'cad-b@guarda.local', '{"company":"Guarda Cadastros B"}');
  select org_id into oa from public.organization_members where user_id = ua;
  select org_id into ob from public.organization_members where user_id = ub;
  insert into public.parties (org_id, type, name, doc, is_customer) values (oa, 'pj', 'Cliente da guarda', '11.222.333/0001-81', true);
  begin
    insert into public.parties (org_id, type, name, doc, is_customer) values (ob, 'pj', 'Cliente da guarda', '11222333000181', true);
  exception when others then
    raise exception 'A4P-CAD-DOC-GLOBAL: a empresa B NÃO conseguiu cadastrar um CNPJ que existe na empresa A — o índice ainda é global: "%"', SQLERRM;
  end;
  begin
    insert into public.parties (org_id, type, name, doc, is_supplier) values (oa, 'pj', 'Outro nome', '11222333000181', true);
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  if msg is null or msg not like '%parties_org_doc_unico%' then
    raise exception 'A4P-CAD-DOC: o mesmo CNPJ entrou duas vezes na mesma empresa (%).', coalesce(msg, 'aceito');
  end if;
  raise notice 'caso 7 OK — o mesmo CNPJ em duas empresas passa; duas vezes na mesma, não';
end $c7$;
rollback to savepoint c7;

-- ─────────── caso 8: nome de categoria único por (empresa, grupo) ───────────
savepoint c8;
do $c8$
declare u uuid := gen_random_uuid(); o uuid; g1 uuid; g2 uuid; msg text;
begin
  insert into auth.users (id, email, raw_user_meta_data)
    values (u, 'cad-a@guarda.local', '{"company":"Guarda Cadastros A"}');
  select org_id into o from public.organization_members where user_id = u;
  begin
    insert into public.categories (org_id, kind, name) values (o, 'despesa', ' marketing ');
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  if msg is null or msg not like '%categories_org_pai_nome_unico%' then
    raise exception 'A4P-CAD-NOME-CATEGORIA: "Marketing" entrou duas vezes na raiz da mesma empresa (%).', coalesce(msg, 'aceito');
  end if;
  insert into public.categories (org_id, kind, name) values (o, 'despesa', 'Grupo um') returning id into g1;
  insert into public.categories (org_id, kind, name) values (o, 'despesa', 'Grupo dois') returning id into g2;
  begin
    insert into public.categories (org_id, kind, name, parent_id) values (o, 'despesa', 'Diversos', g1);
    insert into public.categories (org_id, kind, name, parent_id) values (o, 'despesa', 'Diversos', g2);
  exception when others then
    raise exception 'CASO 8 FALHOU: o mesmo nome em GRUPOS diferentes foi recusado: "%"', SQLERRM;
  end;
  raise notice 'caso 8 OK — nome único por grupo; o mesmo nome em grupos diferentes passa';
end $c8$;
rollback to savepoint c8;

-- ─────────── caso 9: grupos só da MESMA empresa, e sem ciclo ────────────────
savepoint c9;
do $c9$
declare ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); oa uuid; ob uuid;
        ca uuid; cb uuid; cc uuid; gb uuid; pa uuid; msg text;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (ua, 'cad-a@guarda.local', '{"company":"Guarda Cadastros A"}'),
    (ub, 'cad-b@guarda.local', '{"company":"Guarda Cadastros B"}');
  select org_id into oa from public.organization_members where user_id = ua;
  select org_id into ob from public.organization_members where user_id = ub;

  select id into cb from public.cost_centers where org_id = ob limit 1;
  begin
    insert into public.cost_centers (org_id, name, parent_id) values (oa, 'Centro da guarda', cb);
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  if msg is null or msg not like '%não existe nesta empresa%' then
    raise exception 'A4P-CAD-ORG: um centro de custo foi pendurado num centro de OUTRA empresa (%).', coalesce(msg, 'aceito');
  end if;

  insert into public.cost_centers (org_id, name) values (oa, 'Centro pai') returning id into ca;
  insert into public.cost_centers (org_id, name, parent_id) values (oa, 'Centro filho', ca) returning id into cc;
  begin
    update public.cost_centers set parent_id = cc where id = ca;
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  if msg is null or msg not like '%ciclo%' then
    raise exception 'A4P-CAD-CICLO: a árvore de centros aceitou um ciclo (%).', coalesce(msg, 'aceito');
  end if;

  select id into gb from public.categories where org_id = ob and name = 'Outras despesas';
  begin
    insert into public.categories (org_id, kind, name, parent_id) values (oa, 'despesa', 'Infiltrada', gb);
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  if msg is null or msg not like '%não existe no plano de contas desta empresa%' then
    raise exception 'A4P-CAD-ORG: uma categoria foi pendurada num grupo de OUTRA empresa (%).', coalesce(msg, 'aceita');
  end if;

  insert into public.parties (org_id, type, name) values (ob, 'pj', 'Cliente de B') returning id into pa;
  begin
    insert into public.projects (org_id, name, party_id) values (oa, 'Projeto da guarda', pa);
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  if msg is null or msg not like '%não existe nesta empresa%' then
    raise exception 'A4P-CAD-ORG: um projeto apontou para o cliente de OUTRA empresa (%).', coalesce(msg, 'aceito');
  end if;
  raise notice 'caso 9 OK — grupo, cliente e centro só da mesma empresa; ciclo recusado';
end $c9$;
rollback to savepoint c9;

-- ─────────── caso 10: uso padrão só em FOLHA da mesma empresa ───────────────
savepoint c10;
do $c10$
declare u uuid := gen_random_uuid(); o uuid; g uuid; f uuid; msg text;
begin
  insert into auth.users (id, email, raw_user_meta_data)
    values (u, 'cad-a@guarda.local', '{"company":"Guarda Cadastros A"}');
  select org_id into o from public.organization_members where user_id = u;
  insert into public.categories (org_id, kind, name) values (o, 'despesa', 'Grupo da guarda') returning id into g;
  insert into public.categories (org_id, kind, name, parent_id) values (o, 'despesa', 'Folha da guarda', g) returning id into f;
  begin
    insert into public.categoria_uso_padrao (org_id, funcao, category_id) values (o, 'taxa_plataforma', g);
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  if msg is null or msg not like '%FOLHA%' then
    raise exception 'A4P-CAD-USO: o uso padrão aceitou um GRUPO (%).', coalesce(msg, 'aceito');
  end if;
  begin
    insert into public.categoria_uso_padrao (org_id, funcao, category_id) values (o, 'taxa_plataforma', f);
  exception when others then
    raise exception 'CASO 10 FALHOU: o uso padrão recusou uma folha: "%"', SQLERRM;
  end;
  if not exists (select 1 from public.audit_log where entidade = 'categoria_uso_padrao' and org_id = o) then
    raise exception 'CASO 10 FALHOU: gravar o uso padrão não deixou evento na trilha.';
  end if;
  raise notice 'caso 10 OK — uso padrão só em folha, e a gravação deixa trilha';
end $c10$;
rollback to savepoint c10;

-- ═══════════════════════════════════════════════════════════════════════════
-- O TESTE NEGATIVO — com a trava de folha DESLIGADA, a asserção do caso 2 tem
-- de disparar e NOMEAR o defeito (A4P-CAD-FOLHA). Vermelho por outro motivo é
-- pior que guarda nenhuma.
-- ═══════════════════════════════════════════════════════════════════════════
savepoint negativo;
do $neg$
declare u uuid := gen_random_uuid(); o uuid; c uuid; g uuid; msg text := null;
begin
  drop trigger lancamento_categoria_folha on public.movements;
  begin
    insert into auth.users (id, email, raw_user_meta_data)
      values (u, 'cad-a@guarda.local', '{"company":"Guarda Cadastros A"}');
    select org_id into o from public.organization_members where user_id = u;
    select id into c from public.financial_accounts where org_id = o limit 1;
    insert into public.categories (org_id, kind, name) values (o, 'despesa', 'Grupo da guarda') returning id into g;
    insert into public.categories (org_id, kind, name, parent_id) values (o, 'despesa', 'Folha da guarda', g);
    declare aceito boolean := false;
    begin
      begin
        insert into public.movements (org_id, account_id, type, amount, due_date, origem, category_id)
          values (o, c, 'saida', 100, current_date, 'manual', g);
        aceito := true;
      exception when others then aceito := false;
      end;
      -- A MESMA asserção do caso 2, palavra por palavra.
      if aceito then
        raise exception 'A4P-CAD-FOLHA: um lançamento foi aceito num GRUPO do plano de contas.';
      end if;
    end;
  exception when others then
    msg := SQLERRM;
  end;
  if msg is null then
    raise exception 'GUARDA CEGA: com a trava de folha DESLIGADA, a asserção do caso 2 não disparou.';
  end if;
  if msg not like '%A4P-CAD-FOLHA%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO: a guarda reprovou com "%", que não é a asserção da folha.', msg;
  end if;
  raise notice 'teste negativo OK — sem a trava, o vermelho nomeia o defeito: %', msg;
end $neg$;
rollback to savepoint negativo;

rollback;
