-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA (Rodada 7): o lançamento passa a apontar para a categoria do
-- cadastro — e SÓ quando é seguro. `vincular_categorias_por_nome` liga o texto
-- livre à categoria de mesmo nome e PULA: mês fechado, grupo (não folha), nome
-- ambíguo (dois cadastros), amostra, categoria inativa, nome sem cadastro e
-- chave já preenchida. Cada corte é um caso; termina em ROLLBACK.
--
-- Provada plantando o defeito: sem o corte do mês fechado, o caso 3 reprova
-- (o gatilho de período recusa a escrita e a função derruba); sem o corte do
-- grupo, o caso 2 reprova nomeando a regra de folha.
-- ═══════════════════════════════════════════════════════════════════════════
begin;

do $$
declare
  u constant uuid := 'c7000000-0000-0000-0000-000000000001';
  o uuid; c uuid;
  cat_aluguel uuid; cat_grupo uuid; cat_filha uuid; cat_dup1 uuid; cat_dup2 uuid;
  cat_inativa uuid; cat_mkt uuid;
  m_ok uuid; m_grupo uuid; m_fechado uuid; m_amostra uuid; m_sem uuid;
  m_ja uuid; m_dup uuid; m_inativa uuid;
  n int; v uuid;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (u, 'vinculo@guarda.local', '{"company":"Guarda Vínculo"}');
  select org_id into o from public.organization_members where user_id = u limit 1;
  if o is null then raise exception 'GUARDA INVÁLIDA: provisionamento não criou empresa'; end if;
  select id into c from public.financial_accounts where org_id = o limit 1;

  -- O seed já criou "Aluguel" e "Marketing" (folhas).
  select id into cat_aluguel from public.categories where org_id = o and name = 'Aluguel';
  select id into cat_mkt from public.categories where org_id = o and name = 'Marketing';
  if cat_aluguel is null or cat_mkt is null then
    raise exception 'GUARDA INVÁLIDA: o seed não criou Aluguel/Marketing';
  end if;
  insert into public.categories (org_id, kind, name) values (o, 'despesa', 'Pessoal guarda') returning id into cat_grupo;
  insert into public.categories (org_id, kind, name, parent_id) values (o, 'despesa', 'Salários guarda', cat_grupo) returning id into cat_filha;
  -- O mesmo nome sob dois pais: o índice único permite, e escolher seria chutar.
  insert into public.categories (org_id, kind, name, parent_id) values (o, 'despesa', 'Duplicada guarda', cat_grupo) returning id into cat_dup1;
  insert into public.categories (org_id, kind, name) values (o, 'despesa', 'Duplicada guarda') returning id into cat_dup2;
  insert into public.categories (org_id, kind, name, active) values (o, 'despesa', 'Inativa guarda', false) returning id into cat_inativa;

  insert into public.movements (org_id, account_id, type, amount, description, due_date, origem, situacao, category)
  values (o, c, 'saida', 100, 'ok', '2026-09-10', 'manual', 'previsto', '  aluguel ') returning id into m_ok;
  insert into public.movements (org_id, account_id, type, amount, description, due_date, origem, situacao, category)
  values (o, c, 'saida', 100, 'grupo', '2026-09-10', 'manual', 'previsto', 'Pessoal guarda') returning id into m_grupo;
  insert into public.movements (org_id, account_id, type, amount, description, due_date, origem, situacao, category)
  values (o, c, 'saida', 100, 'fechado', '2026-07-10', 'manual', 'previsto', 'Marketing') returning id into m_fechado;
  insert into public.movements (org_id, account_id, type, amount, description, due_date, origem, situacao, category, is_sample, sample_reason)
  values (o, c, 'saida', 100, 'amostra', '2026-09-10', 'manual', 'previsto', 'Aluguel', true, 'onboarding_demo') returning id into m_amostra;
  insert into public.movements (org_id, account_id, type, amount, description, due_date, origem, situacao, category)
  values (o, c, 'saida', 100, 'sem', '2026-09-10', 'manual', 'previsto', 'Nome que não existe') returning id into m_sem;
  insert into public.movements (org_id, account_id, type, amount, description, due_date, origem, situacao, category, category_id)
  values (o, c, 'saida', 100, 'ja', '2026-09-10', 'manual', 'previsto', 'Aluguel', cat_mkt) returning id into m_ja;
  insert into public.movements (org_id, account_id, type, amount, description, due_date, origem, situacao, category)
  values (o, c, 'saida', 100, 'dup', '2026-09-10', 'manual', 'previsto', 'Duplicada guarda') returning id into m_dup;
  insert into public.movements (org_id, account_id, type, amount, description, due_date, origem, situacao, category)
  values (o, c, 'saida', 100, 'inativa', '2026-09-10', 'manual', 'previsto', 'Inativa guarda') returning id into m_inativa;

  -- Fecha julho DEPOIS de lançar (lançar em mês fechado já seria recusado).
  insert into public.accounting_periods (org_id, period, status) values (o, '2026-07-01', 'locked');

  n := public.vincular_categorias_por_nome(o);

  -- 1. o caso feliz: maiúscula e espaço não impedem, e só ELE é ligado
  select category_id into v from public.movements where id = m_ok;
  if v is distinct from cat_aluguel then raise exception 'CASO 1 FALHOU: o texto "  aluguel " não foi ligado à categoria Aluguel'; end if;
  if n <> 1 then raise exception 'CASO 1 FALHOU: % lançamento(s) ligados — esperado exatamente 1', n; end if;
  -- 2. grupo não recebe lançamento
  select category_id into v from public.movements where id = m_grupo;
  if v is not null then raise exception 'CASO 2 FALHOU: lançamento ligado a um GRUPO (não folha)'; end if;
  -- 3. mês fechado não se mexe
  select category_id into v from public.movements where id = m_fechado;
  if v is not null then raise exception 'CASO 3 FALHOU: lançamento de mês FECHADO foi alterado'; end if;
  -- 4. amostra fica para a purga
  select category_id into v from public.movements where id = m_amostra;
  if v is not null then raise exception 'CASO 4 FALHOU: lançamento da AMOSTRA foi ligado'; end if;
  -- 5. sem cadastro, nada se inventa
  select category_id into v from public.movements where id = m_sem;
  if v is not null then raise exception 'CASO 5 FALHOU: nome sem cadastro ganhou categoria'; end if;
  -- 6. chave já preenchida nunca é trocada
  select category_id into v from public.movements where id = m_ja;
  if v is distinct from cat_mkt then raise exception 'CASO 6 FALHOU: a chave existente foi TROCADA'; end if;
  -- 7. nome ambíguo fica
  select category_id into v from public.movements where id = m_dup;
  if v is not null then raise exception 'CASO 7 FALHOU: nome AMBÍGUO foi ligado a um dos dois cadastros'; end if;
  -- 8. categoria inativa não recebe
  select category_id into v from public.movements where id = m_inativa;
  if v is not null then raise exception 'CASO 8 FALHOU: lançamento ligado a categoria INATIVA'; end if;

  -- 9. idempotente: a segunda passada não liga mais nada
  n := public.vincular_categorias_por_nome(o);
  if n <> 0 then raise exception 'CASO 9 FALHOU: a segunda execução ligou % lançamento(s)', n; end if;

  raise notice 'categoria-vinculo: 9 casos OK';
end $$;

rollback;
