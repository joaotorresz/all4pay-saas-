/**
 * all4pay — Financial Data Moat (GAP 5)
 * -------------------------------------
 * O ativo estrutural de longo prazo: dados financeiros proprietários +
 * comportamento + modelos + inteligência acumulada. Transforma cada
 * empresa em sinal de uma rede que aprende junto (cross-tenant).
 *
 * Camadas: Feature Store → Company DNA → Behavioral Models → Benchmark
 * Engine → Treasury/Credit Intelligence → Knowledge Graph →
 * Self-Improving AI. Puro, tipado, explicável, demo-safe.
 *
 * A coorte é SINTÉTICA e ANONIMIZADA (data lake demo) — o benchmark
 * anonimizado real exige a base cross-tenant conectada em produção.
 */

export type Setor = "eventos" | "saas" | "varejo" | "fintech" | "servicos";
export type Faixa = "5-20M" | "20-50M" | "50M+" | "<5M";
export type Desfecho = "escalou" | "saudavel" | "stress" | "quebrou";

/** Vetor de features financeiras padronizado (a "linguagem" do moat). */
export interface EmpresaFeatures {
  margem: number; // 0..1
  runwayMeses: number;
  burnMultiple: number;
  inadimplencia: number; // 0..1
  concentracao: number; // 0..1
  volatilidade: number; // 0..1
  crescimento: number; // -.. +
  liquidez: number; // ratio
  recorrencia: number; // 0..1
  ticketMedio: number;
}

export interface EmpresaCoorte extends EmpresaFeatures {
  id: string;
  setor: Setor;
  faixa: Faixa;
  faturamentoAnual: number;
  desfecho: Desfecho; // label (data lake histórico)
  stress: 0 | 1; // alvo binário do modelo
}

/* ---- Company DNA ---- */
export interface DnaTraco {
  nome: string;
  valor: number; // 0..100
}
export interface CompanyDNA {
  arquetipo: string;
  descricao: string;
  tracos: DnaTraco[];
  assinatura: string; // ex: "AGR-SAZ-CRE"
}

/* ---- Benchmark ---- */
export interface BenchmarkLinha {
  metrica: string;
  empresa: number;
  medianaSetor: number;
  percentil: number; // 0..100 (posição na coorte)
  melhorAcima: boolean;
  formato: "pct" | "num" | "meses" | "moeda";
}
export interface Benchmark {
  setor: Setor;
  faixa: Faixa;
  pares: number;
  linhas: BenchmarkLinha[];
}

/* ---- Behavioral match ---- */
export interface BehavioralMatch {
  similares: number;
  shareStress: number; // 0..1 dos pares semelhantes que entraram em stress
  desfechoProvavel: Desfecho;
  padrao: string;
  alerta: string | null;
}

/* ---- Credit intelligence ---- */
export interface CreditIntelligence {
  probabilidadeInadimplencia: number; // 0..1 (modelo)
  limiteRecomendado: number;
  confiabilidade: "alta" | "media" | "baixa";
  detalhe: string;
}

/* ---- Treasury network ---- */
export interface TreasuryNetwork {
  setor: Setor;
  mesesStress: string[];
  texto: string;
}

/* ---- Self-improving model ---- */
export interface ModelStats {
  amostras: number;
  acuracia: number; // 0..1 (holdout)
  auc: number; // 0..1
  curvaAprendizado: { n: number; acuracia: number }[];
  pesos: { feature: string; peso: number }[];
}

/* ---- Knowledge graph (sistêmico) ---- */
export interface SystemicNode {
  id: string;
  label: string;
  tipo: "setor" | "empresa";
  risco: number; // 0..1
  peso: number;
}

export interface DataMoatReport {
  empresa: EmpresaFeatures;
  setor: Setor;
  dna: CompanyDNA;
  benchmark: Benchmark;
  behavioral: BehavioralMatch;
  credito: CreditIntelligence;
  treasury: TreasuryNetwork;
  modelo: ModelStats;
  versaoModelo: string;
}

export const VERSAO_MOAT = "datamoat/1.0.0";
