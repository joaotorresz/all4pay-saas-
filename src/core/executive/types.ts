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

/*
 * ⚠️ ID DERIVADO DO CONTEÚDO, NUNCA DE CONTADOR — a regra da Rodada 9 (que
 * `core/autonomous` já segue), agora também no motor executivo.
 *
 * Era `uid()`, um contador de módulo, e o motor roda de novo a cada
 * renderização (`useCentroInteligencia` não memoriza). A MESMA leitura nascia
 * com outro id a cada redesenho — medido: duas execuções sobre a mesma entrada
 * davam `anom_0` e `anom_7`. No antigo `/copiloto` isso tornava dois controles
 * inertes sem erro nenhum: o "Marcar revisada" gravava o selo sob um id que já
 * não existia no redesenho seguinte (o selo nunca apareceu), e a narração por
 * IA, casada pelo id, nunca casou com nada.
 *
 * Mesmo conteúdo é a mesma leitura; quando a situação muda, o conteúdo muda e
 * ela é outra.
 */
export const chaveDeTexto = (s: string): string =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * Duas entradas com a mesma chave ganham sufixo pela ORDEM em que aparecem — e
 * a ordem é a mesma para a mesma entrada, então o sufixo também é estável.
 */
export function semIdRepetido<T extends { id: string }>(xs: T[]): T[] {
  const vistos = new Map<string, number>();
  return xs.map((x) => {
    const n = (vistos.get(x.id) ?? 0) + 1;
    vistos.set(x.id, n);
    return n === 1 ? x : { ...x, id: `${x.id}#${n}` };
  });
}
