-- ═══════════════════════════════════════════════════════════════════════════
-- A4P-070 — o GRANT residual nas tabelas `maq_*` que a RLS já nega
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Três tabelas da maquininha têm RLS ligada e ZERO políticas. Isso já nega tudo
-- para quem não é dono — mas o privilégio continua concedido a `authenticated`,
-- e é a LISTA DE PRIVILÉGIOS que alguém lê numa auditoria. Um `has_table_
-- privilege` verdadeiro sobre uma tabela que na prática está fechada faz o
-- auditor concluir o oposto do que é verdade, e a conclusão errada vem com a
-- confiança de ter sido medida.
--
-- ⚠️ **E SÃO EXATAMENTE TRÊS, não dez** — a correção da minha própria
-- ampliação. Ao medir, contei 10 tabelas `maq_*` com os quatro verbos
-- concedidos a `authenticated` e propus revogar em todas. Errado: SETE delas
-- têm a política `maq_admin_all` (`FOR ALL ... USING maq_is_admin()`) aplicada
-- ao papel `authenticated` — ou seja, `authenticated` é o papel por onde o
-- administrador da maquininha opera, e revogar o grant ali QUEBRARIA a
-- aplicação. A política existe justamente para permitir esse acesso.
--
-- O alvo certo é só onde o grant não serve a política nenhuma:
--
--   · maq_cnpj_cache    (RLS ligada, 0 políticas)
--   · maq_leads         (RLS ligada, 0 políticas)
--   · maq_whatsapp_log  (RLS ligada, 0 políticas)
--
-- ⚠️ **Nenhuma delas é lida por este repositório** (`grep -rn "maq_" src/`
-- devolve só um comentário), e a escrita que existe não passa por
-- `authenticated`: `maq_cnpj_cache` tem 25 linhas gravadas em 11 dias
-- distintos, e com RLS negando para `authenticated` esse escritor só pode ser
-- `service_role` ou o dono. Revogar aqui não alcança ninguém que trabalha.
--
-- ⚠️ Revoga também de `anon`, que não tinha SELECT mas podia ter herdado
-- qualquer outro verbo — é a mesma família do achado da ONDA 9, em que `anon`
-- podia dar TRUNCATE em 57 tabelas sem violar política nenhuma.

revoke all on public.maq_cnpj_cache   from authenticated, anon;
revoke all on public.maq_leads        from authenticated, anon;
revoke all on public.maq_whatsapp_log from authenticated, anon;

comment on table public.maq_cnpj_cache is
  'Cache de consulta de CNPJ da maquininha. Sem politica de RLS: so o dono e service_role alcancam. Grant de authenticated/anon revogado em 17/08/2026 (A4P-070) porque privilegio concedido sobre tabela fechada engana quem audita.';
comment on table public.maq_leads is
  'Leads da maquininha. Sem politica de RLS: so o dono e service_role alcancam. Grant de authenticated/anon revogado em 17/08/2026 (A4P-070).';
comment on table public.maq_whatsapp_log is
  'Log de WhatsApp da maquininha. Sem politica de RLS: so o dono e service_role alcancam. Grant de authenticated/anon revogado em 17/08/2026 (A4P-070).';
