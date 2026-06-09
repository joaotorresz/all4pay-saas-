/**
 * Automation + Notification Engine — executa as ações disparadas pelas
 * regras. Regras críticas executam na hora; baixas vão para fila assíncrona.
 * In-memory/demo: registra a execução (em produção, integra WhatsApp/e-mail/
 * cobrança reais). Toda execução é auditável.
 */
import type { RuleFire, ExecucaoAcao, ActionType, Prioridade } from "./types";
import { uid } from "./types";

const LABEL: Record<ActionType, string> = {
  enviar_whatsapp: "WhatsApp enviado",
  enviar_email: "E-mail enviado",
  gerar_cobranca: "Cobrança gerada",
  bloquear_pagamento: "Pagamento bloqueado",
  marcar_risco: "Cliente marcado em risco",
  notificar_time: "Time notificado",
  criar_tarefa: "Tarefa criada",
  pedir_aprovacao_dupla: "Aprovação dupla solicitada",
};

export function executarAcoes(fires: RuleFire[]): ExecucaoAcao[] {
  const out: ExecucaoAcao[] = [];
  for (const f of fires) {
    const assincrona: Prioridade[] = ["baixa"];
    const enfileira = assincrona.includes(f.rule.prioridade);
    for (const a of f.actions) {
      out.push({
        id: uid("exec"),
        ruleId: f.rule.id,
        ruleNome: f.rule.nome,
        acao: a.tipo,
        destino: a.destino,
        status: enfileira ? "enfileirada" : "executada",
        timestamp: new Date().toISOString(),
        detalhe: `${LABEL[a.tipo]}${a.destino ? ` → ${a.destino}` : ""}${enfileira ? " (fila assíncrona)" : ""}`,
      });
    }
  }
  return out;
}

export const actionLabel = (a: ActionType) => LABEL[a];
