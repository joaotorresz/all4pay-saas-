/**
 * Rules Engine — IF/THEN/ELSE financeiro. Avalia regras contra eventos;
 * quando as condições batem, devolve as ações a executar. Low-code: as
 * regras são dados (FinancialRule), não código — alimentam o Rule Builder.
 */
import type { FinancialRule, FinancialEvent, Condition, RuleFire } from "./types";

function valorCampo(event: FinancialEvent, campo: string): unknown {
  if (campo in event.payload) return event.payload[campo];
  if (campo === "tipo") return event.tipo;
  if (campo === "prioridade") return event.prioridade;
  return undefined;
}

export function avaliarCondicao(event: FinancialEvent, c: Condition): boolean {
  const atual = valorCampo(event, c.campo);
  if (atual == null) return false;
  const a = typeof c.valor === "number" ? Number(atual) : atual;
  switch (c.operador) {
    case ">":
      return Number(a) > Number(c.valor);
    case "<":
      return Number(a) < Number(c.valor);
    case ">=":
      return Number(a) >= Number(c.valor);
    case "<=":
      return Number(a) <= Number(c.valor);
    case "=":
      return String(a) === String(c.valor);
    case "contains":
      return String(a).toLowerCase().includes(String(c.valor).toLowerCase());
    default:
      return false;
  }
}

/** motorRegrasFinanceiras — avalia todas as regras ativas contra um evento. */
export function motorRegrasFinanceiras(
  rules: FinancialRule[],
  event: FinancialEvent,
): RuleFire[] {
  return rules
    .filter((r) => r.ativo && r.trigger === event.tipo)
    .filter((r) => r.conditions.every((c) => avaliarCondicao(event, c)))
    .map((r) => ({ rule: r, event, actions: r.actions }));
}
