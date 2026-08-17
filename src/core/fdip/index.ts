/**
 * analisarImportacao() — orquestra o FDIP ponta a ponta: ingestão →
 * entendimento → classificação (destino + confiança) → entidades →
 * padrões → grafo → plano de setup → central de confiança.
 * Puro, demo-safe.
 */
import type { FDIPReport, OnboardingPlan, Classificacao } from "./types";
import { VERSAO_FDIP } from "./types";
import {
  parseTexto,
  classificarRecord,
  resolverEntidades,
  descobrirPadroes,
  montarGrafo,
  montarPlano,
  centralConfianca,
} from "./engine";

export function analisarImportacao(texto: string): FDIPReport {
  const parse = parseTexto(texto);
  const records = parse.records;

  const classificacoes = records.map(classificarRecord);
  const clsMap = new Map<string, Classificacao>(classificacoes.map((c) => [c.recordId, c]));

  const entidades = resolverEntidades(records);
  const padroes = descobrirPadroes(records, clsMap, entidades);
  const grafo = montarGrafo(entidades);

  const datas = records.map((r) => r.data).sort();
  const periodoMeses =
    datas.length > 1
      ? Math.max(1, (new Date(datas[datas.length - 1]).getTime() - new Date(datas[0]).getTime()) / (30 * 86400000))
      : 1;

  const plano = montarPlano(records, classificacoes, entidades, padroes, Math.round(periodoMeses));
  const confidence = centralConfianca(parse, classificacoes, records);

  return {
    records,
    classificacoes,
    entidades,
    padroes,
    grafo,
    confidence,
    plano,
    periodoMeses: Math.round(periodoMeses),
    versaoModelo: VERSAO_FDIP,
    saldoDeclarado: parse.saldoDeclarado,
  };
}

/** Extrai o plano persistível (auto company setup) do relatório. */
export function planoDeOnboarding(report: FDIPReport): OnboardingPlan {
  return {
    clientes: report.entidades.filter((e) => e.tipo === "cliente").map((e) => ({ nome: e.nome })),
    fornecedores: report.entidades.filter((e) => e.tipo === "fornecedor").map((e) => ({ nome: e.nome })),
    categorias: report.plano.categorias,
    centrosCusto: report.plano.centrosCusto,
  };
}

export { amostraExtrato } from "./sample";
export { aprender } from "./learning";
export type { FDIPReport } from "./types";
export { analisarImportacao as default };
