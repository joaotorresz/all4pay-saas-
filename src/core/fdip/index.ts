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
 * ⚠️ **O separador é `;` — com CITAÇÃO de verdade.** A primeira versão desta
 * função usou TAB porque o `parseCSV` do FDIP não respeitava aspas: uma
 * descrição com `;` ("COMPRA A; PARCELA 1") partiria a linha e o lançamento
 * sumiria. Isso não era "melhoria à parte" — era PERDA DE DADO no caminho de
 * importação, contornada deixando a guarda verde num caso que não acontece
 * (TAB na célula) e cega no que acontece (`;` na célula). O parser agora é
 * ciente de aspas (`parseCSV` em `engine.ts`), então aqui voltamos ao `;` e
 * CITAMOS qualquer célula que contenha `;`, aspa ou quebra de linha — aspa vira
 * `""`. É a citação que o tokenizador desfaz do outro lado, sem perder nada.
 */
export function csvDeLinhas(rows: string[][]): string {
  const citar = (c: string) => {
    const v = (c ?? "").replace(/\r\n?/g, "\n"); // normaliza CR solto/CRLF → \n
    return /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  return rows
    .filter((r) => r.some((c) => (c ?? "").trim() !== ""))
    .map((r) => r.map(citar).join(";"))
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
