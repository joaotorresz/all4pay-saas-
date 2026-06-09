/**
 * Camada de Normalização + Probabilística.
 * Converte movements em recebíveis ponderados por probabilidade de
 * recebimento (modelagem de risco de crédito simplificada).
 */
import type { RiskInput, RiskMovement, RecebivelProb } from "./types";
import { diasEntre } from "./types";

/**
 * Probabilidade de um recebível entrar, em função do status e do atraso.
 * Pago = 1. Em aberto: decai com o atraso (atrasou muito → menos provável).
 */
export function probabilidadeRecebimento(m: RiskMovement, hoje: string): number {
  if (m.status === "pago") return 1;
  if (m.status === "cancelado") return 0;
  const atraso = diasEntre(m.due_date, hoje); // >0 = vencido
  if (atraso <= 0) return 0.92; // ainda a vencer
  if (atraso <= 15) return 0.8;
  if (atraso <= 30) return 0.6;
  if (atraso <= 60) return 0.4;
  return 0.25;
}

/** Recebíveis em aberto, ponderados por probabilidade. */
export function recebiveisPonderados(input: RiskInput): RecebivelProb[] {
  return input.movements
    .filter((m) => m.type === "entrada" && m.status === "pendente")
    .map((m) => {
      const p = probabilidadeRecebimento(m, input.hoje);
      return {
        id: m.id,
        party_id: m.party_id,
        valor: m.amount,
        due_date: m.due_date,
        probabilidadeRecebimento: p,
        valorEsperado: m.amount * p,
      };
    });
}

/** Saídas pendentes (compromissos a pagar). */
export function compromissosAbertos(input: RiskInput): RiskMovement[] {
  return input.movements.filter(
    (m) => m.type === "saida" && m.status === "pendente",
  );
}

/** Realizados (pago) num período de N dias até hoje. */
export function realizados(input: RiskInput, dias: number) {
  const ini = new Date(input.hoje);
  ini.setDate(ini.getDate() - dias);
  const iniISO = ini.toISOString().slice(0, 10);
  return input.movements.filter((m) => {
    if (m.status !== "pago") return false;
    const d = m.paid_date ?? m.due_date;
    return d >= iniISO && d <= input.hoje;
  });
}
