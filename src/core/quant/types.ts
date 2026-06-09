/**
 * all4pay — Camada Quantitativa (terminal de inteligência financeira)
 * ------------------------------------------------------------------
 * Onde o sistema deixa de ser ERP e vira "Bloomberg para PMEs":
 * transforma lançamentos em métricas executivas, score de saúde,
 * radar, projeção e interpretação de CFO digital.
 *
 * Pura, tipada, auditável, demo-safe. Consome o mesmo RiskInput dos
 * demais motores. Valores em REAIS (number), pt-BR.
 */

export type ClassificacaoSaude =
  | "excelente"
  | "saudavel"
  | "atencao"
  | "risco"
  | "critico";

export type Tendencia = "melhorando" | "estavel" | "piorando";

export type VolatilidadeNivel = "alta_previsibilidade" | "moderada" | "alta_volatilidade";

/** KPIs institucionais (motor quantitativo). */
export interface IndicadoresFinanceiros {
  liquidezCorrente: number;
  runwayMeses: number;
  burnRate: number; // R$/mês consumido (0 se gera caixa)
  burnMultiple: number; // queima / nova receita
  margemOperacional: number; // 0..1
  margemLiquida: number; // 0..1
  receitaRecorrente: number; // 0..1 (share recorrente)
  crescimentoMensal: number; // -1..+ (MoM)
  eficienciaOperacional: number; // 0..10
  roic: number; // proxy (NOPAT/capital)
  ticketMedio: number;
  inadimplencia: number; // 0..1
  concentracaoReceita: number; // 0..1 (maior cliente)
  dependenciaCliente: number; // 0..1 (top 2)
  volatilidadeFluxo: number; // 0..1 (CV)
  volatilidadeNivel: VolatilidadeNivel;
  sazonalidade: number; // 0..1 (amplitude do índice)
  qualidadeReceita: number; // 0..100
  receitaMensal: number;
  despesaMensal: number;
}

export interface RadarDimensao {
  dimensao: string;
  valor: number; // 0..100
}

export interface MesScore {
  label: string;
  score: number; // 0..100
}

export interface CenarioPreditivo {
  id: string;
  label: string;
  descricao: string;
  scoreProjetado: number;
  delta: number; // vs score atual
  emDias: number;
}

export interface BenchmarkLinha {
  metrica: string;
  empresa: number;
  setor: number;
  unidade: "pct" | "x" | "num";
  acima: boolean;
}

export interface ScoreFinanceiro {
  score: number; // 0..100
  classificacao: ClassificacaoSaude;
  fatoresPositivos: string[];
  fatoresNegativos: string[];
  probabilidadeRuptura: number; // 0..1 (90 dias)
  tendencia: Tendencia;
}

export interface DiagnosticoQuantitativo {
  hoje: string;
  indicadores: IndicadoresFinanceiros;
  score: ScoreFinanceiro;
  radar: RadarDimensao[];
  serie: { label: string; receita: number; despesa: number; liquido: number }[];
  scoreTemporal: MesScore[];
  cenarios: CenarioPreditivo[];
  benchmark: BenchmarkLinha[];
  narrativa: string;
  versaoModelo: string;
}

export const VERSAO_QUANT = "quant/1.0.0";

export const CLASSIF_SAUDE_LABEL: Record<ClassificacaoSaude, string> = {
  excelente: "Excelente",
  saudavel: "Saudável",
  atencao: "Atenção",
  risco: "Risco elevado",
  critico: "Crítico",
};
