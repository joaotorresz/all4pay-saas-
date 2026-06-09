/**
 * Feature Store — variáveis financeiras estruturadas (atuais +
 * históricas) que alimentam scoring, previsão e recomendação. É o
 * substrato dos modelos: dias de atraso, runway, burn, liquidez,
 * inadimplência, concentração, ticket, margem.
 */
import type { RiskInput } from "@/core/risk-engine/types";
import { scoreRiscoCaixa } from "@/core/risk-engine";
import { analisarQuantitativo } from "@/core/quant";
import { serieMensal } from "@/core/quant/series";
import type { FeatureStore, FinancialFeatures } from "./types";

/** Concentração de fornecedor (share do maior, por pagamentos). */
function concentracaoFornecedor(input: RiskInput): number {
  const porForn = new Map<string, number>();
  let total = 0;
  for (const m of input.movements) {
    if (m.type !== "saida") continue;
    const id = m.party_id ?? "—";
    porForn.set(id, (porForn.get(id) ?? 0) + m.amount);
    total += m.amount;
  }
  if (total === 0) return 0;
  return Math.max(...Array.from(porForn.values())) / total;
}

export function construirFeatures(input: RiskInput): FeatureStore {
  const r = scoreRiscoCaixa(input);
  const q = analisarQuantitativo(input);
  const i = q.indicadores;

  const atual: FinancialFeatures = {
    saldo: input.saldoAtual,
    runwayDias: r.runway.base,
    runwayMeses: i.runwayMeses,
    burnMensal: i.burnRate,
    receitaMensal: i.receitaMensal,
    despesaMensal: i.despesaMensal,
    liquidezCorrente: i.liquidezCorrente,
    inadimplencia: i.inadimplencia,
    concentracaoReceita: i.concentracaoReceita,
    concentracaoFornecedor: concentracaoFornecedor(input),
    ticketMedio: i.ticketMedio,
    margemOperacional: i.margemOperacional,
    crescimentoMensal: i.crescimentoMensal,
    sazonalidade: i.sazonalidade,
    scoreSaude: q.score.score,
    probRuptura: r.probabilidadeRuptura,
    rupturaDia: r.rupturaDia,
  };

  const historico = serieMensal(input)
    .filter((p) => p.receita > 0 || p.despesa > 0)
    .map((p) => ({
      label: p.label,
      receita: p.receita,
      despesa: p.despesa,
      liquido: p.liquido,
      burn: Math.max(0, -p.liquido),
    }));

  return { atual, historico };
}
