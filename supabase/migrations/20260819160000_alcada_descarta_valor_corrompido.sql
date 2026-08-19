-- ═══════════════════════════════════════════════════════════════════════════
-- O ÚNICO `approval_limit` NÃO-NULO ERA LIXO DE CONVERSOR — descartado
-- ═══════════════════════════════════════════════════════════════════════════
--
-- **Decisão do dono, 19/08/2026.** Medido em produção: UMA linha não-nula em
-- `organization_members.approval_limit`, valor **5**, papel `member`, usuário
-- **joaotripodo@all4pay.com.br**, organização `joaov.yoshimi` (677 lançamentos).
--
-- ⚠️ **Não veio de decisão de negócio: veio do conversor defeituoso.**
-- `parseLimite` (lib/governance, removido no P-19) tirava as LETRAS da faixa
-- antes de converter — "R$50 mil" virava 50 e "Sem limite" virava 0, a inversão
-- exata. Nenhuma faixa da tela produz 5; o valor é resíduo, não escolha.
--
-- ⚠️ E ele é INERTE de qualquer forma: o papel é `member`, que não tem a ação
-- `aprovar` em `role_permissions`. Com a Blindagem B, quem confirma sai da
-- matriz de permissões e a alçada só responde QUANTO — então este 5 nunca
-- autorizaria nada, nem se alguém voltasse a ler a coluna.
--
-- ⚠️ **Por que zerar em vez de deixar quieto:** um valor de dinheiro parado
-- numa coluna deprecada é um convite para a próxima sessão "resgatar o dado
-- histórico". Ele não é histórico de nada — é o rastro de um bug. Zerado, a
-- coluna fica uniformemente vazia e a próxima leitura não tem o que
-- interpretar errado.
--
-- A alçada vigente vive em `central_alcada`, por PAPEL, e é lida pelo gatilho
-- `central_maquina`.

update public.organization_members
   set approval_limit = null
 where approval_limit is not null;
