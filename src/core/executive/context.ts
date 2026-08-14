/**
 * Context Builder — o passo CRÍTICO. A IA não recebe "me explique o
 * financeiro"; recebe um contexto numérico estruturado (saldo, runway,
 * burn, inadimplência, concentração, score…) extraído dos motores
 * quant / risco / crédito. Daí a resposta vira contextual, não genérica.
 */
import type { RiskInput } from "@/core/risk-engine/types";
import { scoreRiscoCaixa } from "@/core/risk-engine";
import { analisarQuantitativo } from "@/core/quant";
import { analisarInadimplencia } from "@/core/risk";
import type { ExecutiveContext } from "./types";

export interface MotoresResultado {
  quant: ReturnType<typeof analisarQuantitativo>;
  risco: ReturnType<typeof scoreRiscoCaixa>;
  credito: ReturnType<typeof analisarInadimplencia>;
}

/** Roda os três motores uma vez (reaproveitado pelo centro inteiro). */
export function rodarMotores(input: RiskInput): MotoresResultado {
  return {
    quant: analisarQuantitativo(input),
    risco: scoreRiscoCaixa(input),
    credito: analisarInadimplencia(input),
  };
}

export function construirContexto(
  input: RiskInput,
  m: MotoresResultado,
): ExecutiveContext {
  const i = m.quant.indicadores;
  return {
    hoje: input.hoje,
    saldoAtual: input.saldoAtual,
    runwayMeses: i.runwayMeses,
    burnRate: i.burnRate,
    receitaMensal: i.receitaMensal,
    despesaMensal: i.despesaMensal,
    margemCaixa90d: i.margemCaixa90d,
    crescimentoMensal: i.crescimentoMensal,
    inadimplencia: i.inadimplencia,
    scoreFinanceiro: m.quant.score.score,
    scoreRisco: m.risco.score,
    probRuptura: m.risco.probabilidadeRuptura,
    rupturaDia: m.risco.rupturaDia,
    concentracao: m.risco.concentracao.top
      .slice(0, 3)
      .map((c) => ({ nome: c.name, percentual: Math.round(c.share * 100) })),
    clientesRisco: m.credito.clientes
      .filter((c) => c.classificacao === "alto" || c.classificacao === "critico")
      .slice(0, 5)
      .map((c) => ({ nome: c.nome, score: c.score, exposicao: c.features.volumeAberto })),
  };
}
