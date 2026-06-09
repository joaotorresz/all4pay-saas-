/**
 * Recovery Prediction — estima a chance de recuperar a dívida.
 * Princípio: cliente que atrasa MAS sempre quita tem recuperação alta;
 * crônico de atraso longo, baixa. Ajusta pela severidade (score).
 */
import type { PagamentoEvento, RecoveryPrediction } from "./types";
import { clamp01 } from "./normalize";

export function preverRecuperacao(
  eventos: PagamentoEvento[],
  score: number,
): RecoveryPrediction {
  const pagosComAtraso = eventos.filter(
    (e) => e.status === "pago" && e.diasAtraso > 1,
  ).length;
  const cronicosAbertos = eventos.filter(
    (e) => e.vencido && e.diasAtraso > 60,
  ).length;
  const denom = pagosComAtraso + cronicosAbertos;

  let chance: number;
  let detalhe: string;
  if (denom === 0) {
    chance = score <= 20 ? 0.92 : 0.72;
    detalhe = "Sem histórico de inadimplência relevante.";
  } else {
    chance = clamp01(pagosComAtraso / denom);
    detalhe = `${pagosComAtraso} atraso(s) quitado(s) vs ${cronicosAbertos} crônico(s) em aberto.`;
  }
  // Ajuste pela severidade atual do risco.
  chance = clamp01(chance * (1 - score / 300));
  return { chanceRecuperacao: chance, detalhe };
}
