-- ═══════════════════════════════════════════════════════════════════════════
-- ÁREA DA PLATAFORMA — tira o resíduo de privilégio e NOMEIA o papel
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Auditoria de 13/08/2026. O relato era "abri /admin de uma sessão de usuário
-- comum e vi MRR, ARR, 16 organizações e o controle de plano de terceiros".
--
-- ⚠️ **O relato não se confirmou como vazamento, e a razão importa:** a conta
-- usada no teste É o único dono de plataforma cadastrado. Medido em produção
-- com o papel de um usuário comum de verdade (`member`), em transação desfeita:
-- `admin_orgs()`, `admin_users()`, `admin_overview()` e
-- `admin_set_subscription()` respondem *"Acesso administrativo negado"*, e
-- `plans` / `subscriptions` / `platform_admins` dão *permission denied* no
-- acesso direto. Repetido depois para cinco perfis (Leitura, Operacional,
-- Financeiro, Admin e Owner de organização) × cinco alvos: **25 de 25 negados**.
--
-- ⚠️ **O defeito real era de NOME.** Há 16 admins/owners de organização e 1
-- dono de plataforma. Eles sempre viveram em tabelas separadas
-- (`organization_members.role` × `platform_admins`) — mas os dois se chamavam
-- "admin" na interface, e é por isso que uma auditoria concluiu invasão onde
-- havia acesso legítimo. Um controle que ninguém consegue nomear é um controle
-- que ninguém consegue auditar.
--
-- O que esta migration faz é o resíduo; o 403 no perímetro vive no middleware.

-- ---------- 1. `anon` não executa nada da área administrativa ----------
--
-- ⚠️ Elas são `SECURITY DEFINER` com portão, então `anon` já era recusado pelo
-- `admin_exigir_acesso`. Mas a concessão não tinha por que existir: uma função
-- administrativa executável por quem sequer entrou é superfície de ataque
-- gratuita, e depende de o portão nunca ter um caminho de saída. Defesa em
-- profundidade é justamente não depender disso.

revoke execute on function public.admin_definir_prazo_mfa(uuid, date, text) from anon;
revoke execute on function public.admin_revisao() from anon;
revoke execute on function public.admin_revisar(uuid, text, integer) from anon;
revoke execute on function public.admin_revisar(uuid, integer) from anon;

-- ---------- 2. Leitura residual em tabela de plataforma ----------
--
-- ⚠️ As duas têm RLS ligada e ZERO políticas, então a leitura já era negada —
-- o `grant` era inócuo E enganoso: quem audita a lista de privilégios vê
-- `authenticated` com SELECT em `mrr_snapshots` e conclui que o MRR histórico
-- está aberto. O privilégio some para a lista dizer a verdade.

revoke select on public.mrr_snapshots from authenticated;
revoke select on public.ddl_log from authenticated;

-- ---------- 3. O nome do papel, no próprio banco ----------
--
-- ⚠️ As tabelas `maq_cnpj_cache`, `maq_leads` e `maq_whatsapp_log` também têm
-- `SELECT` residual para `authenticated` e NÃO foram tocadas: pertencem ao
-- outro produto que convive neste projeto (maquininha), e revogar privilégio de
-- um produto que não é este, sem medir o consumo dele, troca um risco teórico
-- por uma quebra real. Fica declarado, não esquecido.

comment on table public.platform_admins is
  'DONO DA PLATAFORMA - papel DISTINTO de admin de organizacao (organization_members.role). Um usuario pode ser admin da sua empresa e NAO ser dono da plataforma; sao tabelas separadas e sempre foram. A confusao entre os dois NOMES na interface foi o que fez uma auditoria concluir invasao onde havia acesso legitimo.';

comment on function public.is_platform_admin() is
  'Responde se o chamador e DONO DA PLATAFORMA. Nao confundir com admin de organizacao. Consumida pelo middleware (403 no perimetro), pelo server component de /admin e pelo portao admin_exigir_acesso.';
