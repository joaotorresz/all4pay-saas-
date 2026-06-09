/** Burn Rate Engine — receita/despesa mensal realizada e burn. */
import type { RiskInput, BurnResult } from "./types";
import { realizados } from "./normalize";

export function calcularBurnRate(input: RiskInput, janelaDias = 90): BurnResult {
  const meses = janelaDias / 30;
  const rows = realizados(input, janelaDias);
  const receita = rows
    .filter((m) => m.type === "entrada")
    .reduce((s, m) => s + m.amount, 0);
  const despesa = rows
    .filter((m) => m.type === "saida")
    .reduce((s, m) => s + m.amount, 0);
  const receitaMensal = receita / meses;
  const despesaMensal = despesa / meses;
  const liquidoMensal = receitaMensal - despesaMensal;
  return {
    receitaMensal,
    despesaMensal,
    liquidoMensal,
    burnMensal: Math.max(0, -liquidoMensal),
  };
}
