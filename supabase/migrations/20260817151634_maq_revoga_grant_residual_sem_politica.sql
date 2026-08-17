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
--   · maq_leads         (RLS ligada, 0 políticas)  ← revogada aqui
--   · maq_whatsapp_log  (RLS ligada, 0 políticas)  ← revogada aqui
--   · maq_cnpj_cache    (RLS ligada, 0 políticas)  ← FICA: schema órfão, ver abaixo
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

-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ `maq_cnpj_cache` FICA DE FORA, e a razão é um achado: ela é SCHEMA ÓRFÃO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A primeira versão desta migration a incluía e o CI reprovou com
-- `relation "public.maq_cnpj_cache" does not exist (SQLSTATE 42P01)` — num banco
-- construído do ZERO pelas migrations deste repositório, a tabela **não existe**.
-- Ela existe só em produção: nenhuma migration a cria. As duas ocorrências do
-- nome no repositório são COMENTÁRIOS, um deles dizendo "o mesmo padrão já usado
-- no dbWrite() do get-rate" — ou seja, alguém já sabia e não trouxe o schema.
--
-- ⚠️ **Revogar com `if exists` seria pior que não revogar.** A migration ficaria
-- verde no CI sem fazer nada (a tabela não está lá) e faria efeito só em
-- produção — um comportamento que diverge entre ambientes é exatamente o que a
-- guarda de esquema existe para impedir, e esconderia o órfão em vez de
-- denunciá-lo.
--
-- `maq_cnpj_cache` entra quando seu CREATE vier para o repositório — mesma
-- classe do PR #91. Enquanto isso o grant residual dela segue registrado como
-- dívida em `docs/auditoria.md`.

revoke all on public.maq_leads        from authenticated, anon;
revoke all on public.maq_whatsapp_log from authenticated, anon;

comment on table public.maq_leads is
  'Leads da maquininha. Sem politica de RLS: so o dono e service_role alcancam. Grant de authenticated/anon revogado em 17/08/2026 (A4P-070).';
comment on table public.maq_whatsapp_log is
  'Log de WhatsApp da maquininha. Sem politica de RLS: so o dono e service_role alcancam. Grant de authenticated/anon revogado em 17/08/2026 (A4P-070).';
