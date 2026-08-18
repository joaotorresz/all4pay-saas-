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

/**
 * ⚠️ **PLANILHA É SÓ MAIS UM FORMATO, NÃO UMA TELA NOVA.** O `.xlsx` do
 * `/dashboard/financial/import` (modelo fixo) e o extrato do `/upload` viravam
 * dois pipelines incompatíveis (A4P-040). Aqui a planilha entra no MESMO
 * pipeline: as linhas viram texto tabulado e seguem por `analisarImportacao` —
 * mesma detecção de coluna, mesma classificação, mesma chave de idempotência.
 *
 * ⚠️ **O separador é TAB, não `;`, e é decisão medida.** O `parseCSV` do FDIP
 * NÃO respeita aspas — ele quebra a linha em todo separador, mesmo dentro de
 * `"..."`. Uma descrição com `;` ("COMPRA A; PARCELA 1") partiria a linha em
 * duas e o lançamento sumiria. TAB quase nunca aparece numa célula de extrato,
 * então tabular é o separador seguro com este parser. (Corrigir o parser para
 * ser ciente de aspas é melhoria à parte, fora do escopo mecânico da Fatia 2 —
 * fica anotado.) Quebra de linha na célula vira espaço; linhas vazias saem.
 */
export function csvDeLinhas(rows: string[][]): string {
  const limpa = (c: string) => (c ?? "").replace(/[\t\r\n]+/g, " ").trim();
  return rows
    .filter((r) => r.some((c) => (c ?? "").trim() !== ""))
    .map((r) => r.map(limpa).join("\t"))
    .join("\n");
}

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
