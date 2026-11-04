-- ═══════════════════════════════════════════════════════════════════════════
-- O CRON DE RECORRÊNCIAS GRAVA TÍTULO COM CATEGORIA (04/11/2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Medido em produção, primeira execução real do cron (04/11, 18:12 UTC):
-- 13 contas geradas, 25 falhas. Reproduzido como service_role:
--   42501 permission denied for table categories
--
-- Por quê: os gatilhos `lancamento_em_categoria_folha` (lê categories) e
-- `lancamento_em_cadastro_vigente` (lê financial_accounts e projects) NÃO são
-- SECURITY DEFINER — rodam com os grants de quem grava. A migration
-- 20260818200100 (grants mínimos) revogou categories e projects de
-- service_role porque "nenhum código de servidor as toca": o cron não toca
-- direto, mas o gatilho toca por ele. Toda recorrência COM categoria (9 de 14)
-- deixava de virar conta, e o único vestígio era o contador de falhas.
--
-- A correção é a menor que resolve: só LEITURA, só nas duas tabelas que os
-- gatilhos leem. Não muda nada para o navegador (anon/authenticated) nem dá
-- escrita à chave de serviço. Tornar os gatilhos DEFINER foi descartado: eles
-- passariam a ler a categoria de qualquer empresa pelo id, e a mensagem de
-- erro traz o nome dela.
--
-- Guarda: scripts/service-role-gatilhos.sql (CI). Ela acusa, pelo nome, toda
-- tabela que um gatilho não-definer de movements lê sem SELECT de service_role.

grant select on public.categories to service_role;
grant select on public.projects   to service_role;
