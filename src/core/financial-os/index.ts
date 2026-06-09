/**
 * Financial OS — orquestração. Publica eventos no barramento, avalia as
 * regras, executa as ações e registra a auditoria. Mostra a arquitetura
 * orientada a eventos rodando ponta a ponta (in-memory).
 */
import type {
  FinancialRule,
  FinancialEvent,
  ExecucaoAcao,
  AuditLog,
  RuleFire,
} from "./types";
import { FinancialEventBus } from "./event-bus";
import { motorRegrasFinanceiras } from "./rules-engine";
import { executarAcoes } from "./automation";
import { AuditTrail } from "./audit";
import { instalarPonteRisco, type AlertaExecutivo } from "./bridges/risco.bridge";
import type { RiskInput } from "@/core/risk-engine/types";

export interface OperacaoTrace {
  eventos: FinancialEvent[];
  fires: RuleFire[];
  execucoes: ExecucaoAcao[];
  audit: AuditLog[];
  alertasExecutivos: AlertaExecutivo[];
}

/**
 * Roda uma sequência de eventos contra o conjunto de regras.
 * Cada evento → regras avaliadas → ações executadas → auditoria.
 */
export function operarFinanceiroOS(
  rules: FinancialRule[],
  eventosEntrada: {
    tipo: FinancialEvent["tipo"];
    entidadeId: string;
    payload: Record<string, unknown>;
    prioridade?: FinancialEvent["prioridade"];
  }[],
  riscoInput?: RiskInput,
): OperacaoTrace {
  const bus = new FinancialEventBus();
  const audit = new AuditTrail();
  const fires: RuleFire[] = [];
  const execucoes: ExecucaoAcao[] = [];
  const alertasExecutivos: AlertaExecutivo[] = [];

  // Ponte com o motor de risco: custo_variou → recálculo → alerta executivo.
  if (riscoInput) {
    instalarPonteRisco(bus, riscoInput, (a) => alertasExecutivos.push(a));
  }

  // Consumidor: o motor de regras reage a TODO evento publicado.
  bus.subscribe("*", (event) => {
    const disparos = motorRegrasFinanceiras(rules, event);
    for (const f of disparos) {
      fires.push(f);
      const execs = executarAcoes([f]);
      execucoes.push(...execs);
      execs.forEach((e) =>
        audit.registrar("motor-regras", `Regra "${f.rule.nome}" → ${e.acao}`, event, e),
      );
    }
  });

  for (const e of eventosEntrada) {
    bus.publish(e.tipo, e.entidadeId, e.payload, e.prioridade);
  }

  return {
    eventos: bus.eventos(),
    fires,
    execucoes,
    audit: audit.todos(),
    alertasExecutivos,
  };
}

export * from "./types";
export { reconciliarAutomaticamente, pontuarMatch } from "./reconciliation.engine";
export { normalizar, fingerprint, extrairComprovante } from "./gateway";
export { motorRegrasFinanceiras, avaliarCondicao } from "./rules-engine";
export { centralEventosFinanceiros, FinancialEventBus } from "./event-bus";
export { executarAcoes, actionLabel } from "./automation";
export { sugerirRegras, materializarRegra } from "./ai-interpretation";
export { AuditTrail } from "./audit";
export { getNotificationProvider, simulatedProvider, type NotificationProvider } from "./notifications";
export { recalcularRiscoPorCusto, instalarPonteRisco, type AlertaExecutivo } from "./bridges/risco.bridge";
