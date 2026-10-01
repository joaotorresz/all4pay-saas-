/**
 * Quattro — IA Executiva + Decision Engine
 * ----------------------------------------
 * A camada que faz o sistema operar como analista financeiro + FP&A +
 * tesouraria + consultoria rodando 24h sobre os dados da empresa.
 * Não responde "o que aconteceu?", e sim "o que vai acontecer, o que
 * está errado, o que priorizar, onde está o risco e a oportunidade".
 *
 * Orquestra os motores quant / risco / crédito. Pura, tipada,
 * explicável, demo-safe. Determinística — plugável a um LLM depois.
 */
import type { LeituraRunway } from "@/core/indicadores";
import type { IndicadoresFinanceiros } from "@/core/quant/types";

import type { MotivoIndisponivel } from "@/core/indicadores";
export type InsightTipo =
  | "risco"
  | "oportunidade"
  | "anomalia"
  | "crescimento"
  | "inadimplencia"
  | "caixa"
  | "margem";

export type Severidade = "baixa" | "media" | "alta" | "critica";

export interface ExecutiveInsight {
  id: string;
  tipo: InsightTipo;
  severidade: Severidade;
  titulo: string;
  descricao: string;
  impactoCentavos: number; // impacto financeiro estimado (centavos)
  confianca: number; // 0..1
  recomendacoes: string[];
  criadoEm: string;
  prioridade?: number; // ranking do priorizador (1 = mais urgente)
}

/** Contexto estruturado que alimenta o copiloto (Context Builder). */
export interface ExecutiveContext {
  hoje: string;
  saldoAtual: number;
  /**
   * ⚠️ `null` = runway INDISPONÍVEL (o motivo vem em `runwayMotivo`). Este
   * contexto vai para a IA — a nativa e a do Claude — e um `0` aqui virava
   * "runway de 0 meses" na resposta para uma empresa que gera caixa.
   */
  runwayMeses: number | null;
  runwayMotivo?: { codigo: MotivoIndisponivel; motivo: string };
  burnRate: number;
  receitaMensal: number;
  despesaMensal: number;
  /** ⚠️ Margem de CAIXA (90d). Ver `docs/auditoria.md`, #8 — dois regimes, dois nomes. */
  margemCaixa90d: number;
  crescimentoMensal: number;
  inadimplencia: number; // 0..1
  scoreFinanceiro: number; // 0..100 (saúde)
  scoreRisco: number; // 0..100 (risco de caixa)
  probRuptura: number; // 0..1
  rupturaDia: number | null;
  concentracao: { nome: string; percentual: number }[];
  clientesRisco: { nome: string; score: number; exposicao: number }[];
}

export interface Anomalia {
  id: string;
  classe: "despesa" | "fraude" | "duplicidade";
  severidade: Severidade;
  titulo: string;
  descricao: string;
  valor: number;
  zscore?: number;
  criadoEm: string;
}

export interface ForecastPonto {
  label: string;
  valor: number;
  tipo: "historico" | "previsto";
}

export interface Forecast {
  serie: ForecastPonto[];
  janelaPressao?: { mes: string; texto: string };
  texto: string;
}

export interface PadraoMemoria {
  tipo: "sazonalidade" | "cliente" | "despesa" | "ciclo";
  texto: string;
}

export interface Briefing {
  saudacao: string;
  data: string;
  saldo: number;
  /** ⚠️ `null` = runway indisponível (ver `ExecutiveContext.runwayMotivo`). */
  runway: number | null;
  alertas: string[];
  oportunidades: string[];
  riscoRuptura: "baixo" | "moderado" | "elevado";
  acoes: string[];
  texto: string;
}

export interface RespostaCopiloto {
  resposta: string;
  numeros: { label: string; valor: string }[];
  confianca: number; // 0..1
  fontes: string[]; // motores consultados (explainability)
}

export interface ScenarioInput {
  receitaDelta?: number; // -0.15 = -15%
  despesaDelta?: number;
  inadimplenciaDelta?: number; // +0.10 = +10pp
  folhaDelta?: number; // R$/mês adicionais
}

export interface ScenarioResultado {
  /** ⚠️ Para o SCORE, não para a tela: no teto e sem queima é 33,3. */
  runwayMeses: number;
  /** O runway para EXIBIR — número, ausência (sem queima / caixa negativo) ou teto. */
  runway: LeituraRunway;
  scoreProjetado: number;
  burnRate: number;
  liquidoMensal: number;
  emDias: number;
  texto: string;
}

export interface CentroInteligencia {
  context: ExecutiveContext;
  indicadores: IndicadoresFinanceiros;
  insights: ExecutiveInsight[];
  briefing: Briefing;
  anomalias: Anomalia[];
  forecast: Forecast;
  memoria: PadraoMemoria[];
  versaoModelo: string;
}

export const VERSAO_EXECUTIVO = "executivo/1.0.0";

let _seq = 0;
export const uid = (p: string) => `${p}_${(_seq++).toString(36)}`;
