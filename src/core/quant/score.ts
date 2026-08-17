/**
 * scoreSaudeFinanceira() — o coração executivo. Dezenas de variáveis →
 * 0..100, como um rating (Serasa/Moody's) só que OPERACIONAL. Mais:
 * radar executivo, score temporal (evolução) e score preditivo (cenários).
 */
import type { RiskInput } from "@/core/risk-engine/types";
import type {
  IndicadoresFinanceiros,
  ScoreFinanceiro,
  ClassificacaoSaude,
  RadarDimensao,
  MesScore,
  CenarioPreditivo,
  Tendencia,
} from "./types";
import { serieMensal } from "./series";
import { clamp01, normalizar, media } from "./stat";
import { runwayDeFluxo, mesesDeRunway } from "@/core/indicadores";

/** Pesos do modelo (somam 1.0) — auditáveis. */
export const PESOS = {
  liquidez: 0.2,
  runway: 0.15,
  inadimplencia: 0.15,
  margem: 0.15,
  volatilidade: 0.1,
  concentracao: 0.1,
  crescimento: 0.15,
} as const;

type Health = Record<keyof typeof PESOS, number>;

function saude(i: IndicadoresFinanceiros): Health {
  return {
    liquidez: normalizar(i.liquidezCorrente, 0.7, 2.0),
    runway: normalizar(i.runwayMeses, 3, 18),
    inadimplencia: 1 - clamp01(i.inadimplencia),
    margem: normalizar(i.margemCaixa90d, 0, 0.35),
    volatilidade: 1 - clamp01(i.volatilidadeFluxo),
    concentracao: 1 - clamp01(i.concentracaoReceita),
    crescimento: normalizar(i.crescimentoMensal, -0.1, 0.15),
  };
}

function scoreFromHealth(h: Health): number {
  const raw = (Object.keys(PESOS) as (keyof typeof PESOS)[]).reduce(
    (s, k) => s + h[k] * PESOS[k],
    0,
  );
  return Math.round(clamp01(raw) * 100);
}

/** Score de saúde a partir de um conjunto de indicadores (p/ simulações). */
export function scoreDeIndicadores(i: IndicadoresFinanceiros): number {
  return scoreFromHealth(saude(i));
}

export function classificar(score: number): ClassificacaoSaude {
  if (score >= 85) return "excelente";
  if (score >= 70) return "saudavel";
  if (score >= 50) return "atencao";
  if (score >= 30) return "risco";
  return "critico";
}

const POS: Record<keyof typeof PESOS, string> = {
  liquidez: "Liquidez de curto prazo confortável",
  runway: "Runway robusto",
  inadimplencia: "Inadimplência sob controle",
  margem: "Margem operacional saudável",
  volatilidade: "Fluxo de caixa previsível",
  concentracao: "Receita bem distribuída entre clientes",
  crescimento: "Crescimento consistente da receita",
};
const NEG: Record<keyof typeof PESOS, string> = {
  liquidez: "Liquidez de curto prazo apertada",
  runway: "Runway curto",
  inadimplencia: "Inadimplência elevada",
  margem: "Margem operacional comprimida",
  volatilidade: "Fluxo de caixa volátil",
  concentracao: "Concentração de receita em poucos clientes",
  crescimento: "Receita estagnada ou em queda",
};

/** Score temporal — evolução mês a mês (proxy de margem + liquidez). */
export function scoreTemporal(input: RiskInput, i: IndicadoresFinanceiros): MesScore[] {
  const serie = serieMensal(input);
  const ativos = serie.filter((p) => p.receita > 0 || p.despesa > 0);
  const mediaReceita = media(ativos.map((p) => p.receita)) || 1;
  const hLiq = normalizar(i.liquidezCorrente, 0.7, 2.0);
  return ativos.map((p) => {
    const margem = p.receita > 0 ? p.liquido / p.receita : 0;
    const hMargem = normalizar(margem, -0.1, 0.35);
    const hCresc = normalizar(p.receita / mediaReceita - 1, -0.3, 0.3);
    const score = Math.round(clamp01(0.5 * hMargem + 0.3 * hLiq + 0.2 * hCresc) * 100);
    return { label: p.label, score };
  });
}

function tendencia(temporal: MesScore[]): Tendencia {
  if (temporal.length < 4) return "estavel";
  const ini = media(temporal.slice(0, 3).map((m) => m.score));
  const fim = media(temporal.slice(-3).map((m) => m.score));
  if (fim - ini > 2) return "melhorando";
  if (fim - ini < -2) return "piorando";
  return "estavel";
}

export function scoreSaudeFinanceira(
  input: RiskInput,
  i: IndicadoresFinanceiros,
): { score: ScoreFinanceiro; temporal: MesScore[] } {
  const h = saude(i);
  const score = scoreFromHealth(h);
  const classificacao = classificar(score);

  const chaves = Object.keys(PESOS) as (keyof typeof PESOS)[];
  const fatoresPositivos = chaves.filter((k) => h[k] >= 0.7).map((k) => POS[k]);
  const fatoresNegativos = chaves.filter((k) => h[k] <= 0.4).map((k) => NEG[k]);

  let prob = 1 - score / 100;
  if (i.runwayMeses < 6) prob *= 1.3;
  if (i.volatilidadeFluxo > 0.7) prob *= 1.1;
  const probabilidadeRuptura = Math.round(clamp01(prob) * 100) / 100;

  const temporal = scoreTemporal(input, i);

  return {
    score: {
      score,
      classificacao,
      fatoresPositivos,
      fatoresNegativos,
      probabilidadeRuptura,
      tendencia: tendencia(temporal),
    },
    temporal,
  };
}

/** Radar executivo — 7 dimensões 0..100. */
export function radarExecutivo(i: IndicadoresFinanceiros): RadarDimensao[] {
  const h = saude(i);
  return [
    { dimensao: "Liquidez", valor: Math.round(h.liquidez * 100) },
    { dimensao: "Eficiência", valor: Math.round((i.eficienciaOperacional / 10) * 100) },
    { dimensao: "Crescimento", valor: Math.round(h.crescimento * 100) },
    { dimensao: "Previsibilidade", valor: Math.round(h.volatilidade * 100) },
    { dimensao: "Risco", valor: Math.round((0.5 * h.inadimplencia + 0.5 * h.concentracao) * 100) },
    { dimensao: "Rentabilidade", valor: Math.round(h.margem * 100) },
    {
      dimensao: "Governança",
      valor: Math.round((0.5 * clamp01(i.receitaRecorrente) + 0.5 * h.concentracao) * 100),
    },
  ];
}

/** Score preditivo — simula choques e projeta o score + prazo. */
export function cenariosPreditivos(
  input: RiskInput,
  i: IndicadoresFinanceiros,
): CenarioPreditivo[] {
  const baseScore = scoreFromHealth(saude(i));

  const simular = (dRec: number, dDesp: number, dInad: number) => {
    const receita = i.receitaMensal * (1 + dRec);
    const despesa = i.despesaMensal * (1 + dDesp);
    const liquido = receita - despesa;
    const inad = clamp01(i.inadimplencia + dInad);
    const margem = receita > 0 ? liquido / receita : 0;
    // Fórmula canônica (`core/indicadores`): o cenário projetado usa a MESMA
    // conta do runway real — tetos diferentes faziam o projetado e o atual
    // divergirem sem nenhuma premissa ter mudado.
    const runwayDias = runwayDeFluxo(input.saldoAtual, liquido);
    const runwayMeses = mesesDeRunway(runwayDias);
    const h = saude({
      ...i,
      margemCaixa90d: margem,
      runwayMeses,
      inadimplencia: inad,
    });
    const scoreProjetado = scoreFromHealth(h);
    const emDias = liquido >= 0 ? 90 : Math.max(1, Math.min(90, Math.round(runwayDias)));
    return { scoreProjetado, emDias };
  };

  const defs = [
    { id: "queda_receita", label: "Receita −18%", descricao: "Perda de um cliente relevante", dRec: -0.18, dDesp: 0, dInad: 0 },
    { id: "custo_sobe", label: "Despesa +15%", descricao: "Pressão de custos / insumos", dRec: 0, dDesp: 0.15, dInad: 0 },
    { id: "inadimplencia", label: "Inadimplência +10pp", descricao: "Deterioração da carteira", dRec: 0, dDesp: 0, dInad: 0.1 },
  ];

  return defs.map((d) => {
    const { scoreProjetado, emDias } = simular(d.dRec, d.dDesp, d.dInad);
    return {
      id: d.id,
      label: d.label,
      descricao: d.descricao,
      scoreProjetado,
      delta: scoreProjetado - baseScore,
      emDias,
    };
  });
}
