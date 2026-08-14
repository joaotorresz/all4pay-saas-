/**
 * all4pay — Financial Decision Layer (GAP 4)
 * ------------------------------------------
 * Industrializa a inteligência: deixa de "mostrar números" e passa a
 * DECIDIR — interpretar, pontuar risco probabilístico, prever, recomendar
 * (com impacto quantificado) e agir. Une os motores quant/risco/crédito
 * num cérebro de decisão. Puro, tipado, explicável, demo-safe.
 *
 * Feature Store → Risk Matrix → Prediction (Monte Carlo) →
 * Recommendation (impacto simulado) → Autonomous Actions → Decision Brief.
 */

/* ---- Feature Store ---- */
export interface FinancialFeatures {
  saldo: number;
  runwayDias: number;
  runwayMeses: number;
  burnMensal: number;
  receitaMensal: number;
  despesaMensal: number;
  liquidezCorrente: number;
  inadimplencia: number; // 0..1
  concentracaoReceita: number; // 0..1
  concentracaoFornecedor: number; // 0..1
  ticketMedio: number;
  /** ⚠️ Margem de CAIXA (90d). Ver `docs/auditoria.md`, #8 — dois regimes, dois nomes. */
  margemCaixa90d: number;
  crescimentoMensal: number;
  sazonalidade: number; // 0..1
  scoreSaude: number; // 0..100
  probRuptura: number; // 0..1
  rupturaDia: number | null;
}

export interface FeatureSnapshot {
  label: string;
  receita: number;
  despesa: number;
  liquido: number;
  burn: number;
}

export interface FeatureStore {
  atual: FinancialFeatures;
  historico: FeatureSnapshot[];
}

/* ---- Risk Matrix (multidimensional probabilístico) ---- */
export type RiscoNivel = "baixo" | "moderado" | "alto" | "critico";
export type DimensaoRisco =
  | "caixa"
  | "liquidez"
  | "inadimplencia"
  | "concentracao"
  | "fornecedor"
  | "operacional"
  | "sazonal"
  | "crescimento";

export interface RiscoDimensao {
  id: DimensaoRisco;
  label: string;
  probabilidade: number; // 0..1
  nivel: RiscoNivel;
  peso: number; // 0..1 no agregado
  fator: string;
}

export interface RiskMatrix {
  dimensoes: RiscoDimensao[];
  probabilidadeStress: number; // 0..1 (agregado)
  nivelGeral: RiscoNivel;
  fatoresCriticos: string[];
}

/* ---- Prediction Engine (Monte Carlo) ---- */
export interface BandaPrevisao {
  dia: number;
  data: string;
  p10: number;
  p50: number;
  p90: number;
}

export interface Prediction {
  horizonteDias: number;
  probabilidadeNegativo: number; // 0..1 de ficar negativo no horizonte
  diaProvavelNegativo: number | null;
  dataProvavelNegativo: string | null;
  semanaProvavel: string | null;
  caixaFinalP10: number;
  caixaFinalP50: number;
  caixaFinalP90: number;
  bandas: BandaPrevisao[];
  texto: string;
}

/* ---- Recommendation Engine (impacto quantificado) ---- */
export type AcaoRecomendada =
  | "antecipar_recebiveis"
  | "postergar_fornecedor"
  | "reduzir_despesa"
  | "renegociar_fornecedor"
  | "reduzir_limite_cliente";

export interface Recomendacao {
  id: string;
  acao: AcaoRecomendada;
  titulo: string;
  descricao: string;
  deltaRunwayDias: number; // impacto no runway
  deltaScore: number; // impacto no score de risco
  deltaProbRuptura: number; // impacto na prob. de ruptura (negativo = melhora)
  valorEnvolvido: number;
  prioridade: number;
}

/* ---- Autonomous Actions ---- */
export type ModoExecucao = "automatico" | "proposto" | "requer_aprovacao";
export interface AcaoAutonoma {
  ordem: number;
  acao: string;
  gatilho: string;
  modo: ModoExecucao;
  impacto: string;
}
export interface PlanoAutonomo {
  ativo: boolean;
  severidade: RiscoNivel;
  resumo: string;
  acoes: AcaoAutonoma[];
}

/* ---- Decision Brief ---- */
export interface DecisionBrief {
  hoje: string;
  headline: string;
  features: FeatureStore;
  risco: RiskMatrix;
  previsao: Prediction;
  recomendacoes: Recomendacao[];
  plano: PlanoAutonomo;
  versaoModelo: string;
}

export const VERSAO_DECISION = "decision/1.0.0";

let _seq = 0;
export const uid = (p: string) => `${p}_${(_seq++).toString(36)}`;
