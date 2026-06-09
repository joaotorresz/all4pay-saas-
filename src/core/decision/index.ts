/**
 * decidir() — orquestra a Financial Decision Layer ponta a ponta:
 * Feature Store → Risk Matrix → Prediction (Monte Carlo) → Recommendation
 * (impacto simulado) → Autonomous Plan → Decision Brief. Reaproveita os
 * motores quant/risco/crédito. Puro, explicável, demo-safe.
 */
import type { RiskInput } from "@/core/risk-engine/types";
import type { DecisionBrief } from "./types";
import { VERSAO_DECISION } from "./types";
import { construirFeatures } from "./features";
import { calcularRiskMatrix } from "./risk-matrix";
import { preverCaixa } from "./prediction";
import { gerarRecomendacoes } from "./recommendations";
import { planoAutonomo } from "./autonomous";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

export function decidir(input: RiskInput): DecisionBrief {
  const features = construirFeatures(input);
  const risco = calcularRiskMatrix(features.atual);
  const previsao = preverCaixa(features.atual, input.hoje);
  const recomendacoes = gerarRecomendacoes(input);
  const plano = planoAutonomo(risco, features.atual);

  const headline = montarHeadline(features.atual, risco, previsao, recomendacoes);

  return {
    hoje: input.hoje,
    headline,
    features,
    risco,
    previsao,
    recomendacoes,
    plano,
    versaoModelo: VERSAO_DECISION,
  };
}

function montarHeadline(
  f: ReturnType<typeof construirFeatures>["atual"],
  risco: ReturnType<typeof calcularRiskMatrix>,
  previsao: ReturnType<typeof preverCaixa>,
  recs: ReturnType<typeof gerarRecomendacoes>,
): string {
  const abertura =
    previsao.probabilidadeNegativo >= 0.2 && previsao.semanaProvavel
      ? `Há ${Math.round(previsao.probabilidadeNegativo * 100)}% de chance do seu caixa ficar negativo na ${previsao.semanaProvavel}.`
      : f.rupturaDia != null
        ? `Seu caixa fica sob pressão em ${f.rupturaDia} dias.`
        : `Caixa saudável: probabilidade de stress de ${Math.round(risco.probabilidadeStress * 100)}% nos próximos 90 dias.`;

  const causas = risco.fatoresCriticos.slice(0, 3);
  const causasTxt = causas.length ? ` Principais causas: ${causas.join("; ")}.` : "";

  const sugestoes = recs.slice(0, 2).map((r) => {
    const ganho =
      r.deltaRunwayDias > 0
        ? `+${Math.round(r.deltaRunwayDias)} dias de runway`
        : r.deltaScore > 0
          ? `+${r.deltaScore} no score`
          : `${Math.round(-r.deltaProbRuptura * 100)}pp de risco a menos`;
    return `${r.titulo.toLowerCase()} (${ganho})`;
  });
  const sugestoesTxt = sugestoes.length ? ` Sugestões: ${sugestoes.join("; ")}.` : "";

  void fmt;
  return `${abertura}${causasTxt}${sugestoesTxt}`;
}

export type { DecisionBrief } from "./types";
export { decidir as default };
