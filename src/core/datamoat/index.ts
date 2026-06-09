/**
 * analisarMoat() — orquestra o Financial Data Moat: mapeia a empresa para
 * o vetor de features, e cruza com a coorte/modelo para gerar DNA,
 * benchmark, comportamento, crédito, treasury network e estatísticas do
 * modelo auto-aprendiz. Reaproveita o motor quantitativo. Demo-safe.
 */
import type { RiskInput } from "@/core/risk-engine/types";
import { analisarQuantitativo } from "@/core/quant";
import type { DataMoatReport, EmpresaFeatures, Setor, TreasuryNetwork } from "./types";
import { VERSAO_MOAT } from "./types";
import { companyDNA } from "./dna";
import { benchmark } from "./benchmark";
import { behavioralMatch } from "./behavior";
import { creditIntelligence } from "./credit";
import { modeloDeCredito } from "./model";

const TREASURY: Record<Setor, string[]> = {
  eventos: ["jan", "fev", "mar"],
  saas: ["dez", "jan"],
  varejo: ["fev", "mar"],
  fintech: ["jan", "jul"],
  servicos: ["jan", "fev"],
};

export function mapearFeatures(input: RiskInput): { features: EmpresaFeatures; receitaMensal: number } {
  const i = analisarQuantitativo(input).indicadores;
  return {
    features: {
      margem: i.margemOperacional,
      runwayMeses: i.runwayMeses,
      burnMultiple: i.burnMultiple,
      inadimplencia: i.inadimplencia,
      concentracao: i.concentracaoReceita,
      volatilidade: i.volatilidadeFluxo,
      crescimento: i.crescimentoMensal,
      liquidez: Math.min(i.liquidezCorrente, 5),
      recorrencia: i.receitaRecorrente,
      ticketMedio: i.ticketMedio,
    },
    receitaMensal: i.receitaMensal,
  };
}

export function analisarMoat(input: RiskInput, setor: Setor = "eventos"): DataMoatReport {
  const { features, receitaMensal } = mapearFeatures(input);
  const { stats } = modeloDeCredito();

  const treasury: TreasuryNetwork = {
    setor,
    mesesStress: TREASURY[setor],
    texto: `Empresas com perfil semelhante no setor costumam enfrentar stress de caixa em ${TREASURY[setor].join("–")}.`,
  };

  return {
    empresa: features,
    setor,
    dna: companyDNA(features),
    benchmark: benchmark(features, setor),
    behavioral: behavioralMatch(features),
    credito: creditIntelligence(features, receitaMensal),
    treasury,
    modelo: stats,
    versaoModelo: VERSAO_MOAT,
  };
}

export type { DataMoatReport } from "./types";
export { analisarMoat as default };
