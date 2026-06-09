/** Modelo de inadimplência — exposição vencida sobre o total a receber. */
import type { RiskInput, InadimplenciaResult } from "./types";

export function calcularRiscoInadimplencia(input: RiskInput): InadimplenciaResult {
  const abertos = input.movements.filter(
    (m) => m.type === "entrada" && m.status === "pendente",
  );
  const total = abertos.reduce((s, m) => s + m.amount, 0);
  const vencidos = abertos.filter((m) => m.due_date < input.hoje);
  const overdueAmount = vencidos.reduce((s, m) => s + m.amount, 0);
  const clientes = new Set(vencidos.map((m) => m.party_id ?? "—"));
  return {
    overdueAmount,
    overdueRatio: total > 0 ? overdueAmount / total : 0,
    clientesEmAtraso: clientes.size,
  };
}
