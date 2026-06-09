/**
 * Credit Intelligence Layer — underwriting proprietário a partir do
 * modelo treinado na coorte: probabilidade de inadimplência, limite
 * recomendado e confiabilidade operacional. Base de crédito/antecipação.
 */
import type { EmpresaFeatures, CreditIntelligence } from "./types";
import { probabilidadeStress } from "./model";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

export function creditIntelligence(e: EmpresaFeatures, receitaMensal: number): CreditIntelligence {
  const pd = probabilidadeStress(e);

  // Capacidade: 3x ticket médio ou ~40% da receita mensal, encolhida pela PD.
  const capacidade = Math.max(e.ticketMedio * 3, receitaMensal * 0.4);
  const limiteRecomendado = Math.round((capacidade * (1 - pd * 0.85)) / 1000) * 1000;

  const confiabilidade: CreditIntelligence["confiabilidade"] =
    pd < 0.15 && e.volatilidade < 0.4 && e.recorrencia > 0.4
      ? "alta"
      : pd < 0.35
        ? "media"
        : "baixa";

  const detalhe = `PD de ${(pd * 100).toFixed(1)}% (modelo proprietário) · limite até ${fmt(limiteRecomendado)} · confiabilidade ${confiabilidade}.`;

  return { probabilidadeInadimplencia: pd, limiteRecomendado, confiabilidade, detalhe };
}
