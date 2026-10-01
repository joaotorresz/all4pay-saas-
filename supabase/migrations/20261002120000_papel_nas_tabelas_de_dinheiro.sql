-- ═══════════════════════════════════════════════════════════════════════════
-- O PAPEL VALE EM TODA TABELA QUE CARREGA DINHEIRO (Rodada 6, 01/10/2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A ONDA 9 pôs políticas RESTRITIVAS por papel em três tabelas (`movements`,
-- `financial_accounts`, `org_state`) e declarou o resto como "extensão
-- mecânica". O resto ficou com a política de EMPRESA apenas: um `leitor` ou o
-- `contador_externo` conseguia, pela API, gravar venda, item, rateio,
-- recorrência e cadastro — a tela escondia o botão, o banco não recusava.
--
-- ⚠️ IMPACTO MEDIDO ANTES (01/10): os 23 vínculos de produção são owner(21),
-- admin(1) e member(1) — todos com `lancar`. Nenhum usuário de hoje perde
-- acesso; a regra passa a valer para os papéis que já não deviam gravar.
--
-- ⚠️ `tem_permissao(acao, org_id)` — a pergunta é "o que eu sou NESTA empresa",
-- nunca na empresa ativa (a lição da ONDA 9).
-- ⚠️ Restritiva SEPARADA para DELETE: `with check` não cobre exclusão.
-- ⚠️ A chave de serviço (crons, webhooks) ignora RLS — nada muda para ela.
do $$
declare
  r record;
  v_cond text;
begin
  for r in
    select * from (values
      -- dinheiro operacional: quem lança
      ('movement_splits', 'lancar', null),
      ('sales_docs',      'lancar', null),
      ('sale_items',      'lancar', null),
      ('recurrences',     'lancar', null),
      -- razão: quem lança OU quem fecha o mês (o contador externo provisiona)
      ('journal_entries', 'lancar', 'fechar'),
      ('journal_lines',   'lancar', 'fechar'),
      -- cadastros que o lançamento referencia: quem lança OU quem administra
      ('parties',         'lancar', 'administrar'),
      ('categories',      'lancar', 'administrar'),
      ('cost_centers',    'lancar', 'administrar'),
      ('projects',        'lancar', 'administrar'),
      ('products',        'lancar', 'administrar'),
      ('services',        'lancar', 'administrar')
    ) as t(tabela, acao1, acao2)
  loop
    if to_regclass('public.' || r.tabela) is null then
      raise notice 'papel: tabela % não existe aqui — política NÃO criada (em produção ela existe; este aviso lá seria defeito).', r.tabela;
      continue;
    end if;
    v_cond := format('public.tem_permissao(%L, org_id)', r.acao1)
      || coalesce(format(' or public.tem_permissao(%L, org_id)', r.acao2), '');

    execute format('drop policy if exists %I on public.%I', r.tabela || '_escrita_exige_papel', r.tabela);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (true) with check (%s)',
      r.tabela || '_escrita_exige_papel', r.tabela, v_cond);

    execute format('drop policy if exists %I on public.%I', r.tabela || '_delete_exige_papel', r.tabela);
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using (%s)',
      r.tabela || '_delete_exige_papel', r.tabela, v_cond);
  end loop;
end $$;
