/**
 * all4pay — Dimensões & tags customizadas + drill-down universal. Inspirado nas
 * "tags/dimensões ilimitadas + drill-down até a transação" do Campfire: pivota
 * os movimentos por qualquer dimensão (categoria, centro de custo, contraparte
 * ou tag customizada) e permite descer da agregação até cada transação.
 * Puro, tipado, demo-safe. Reusa o filtro de período do DRE.
 */
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import { movimentosNoPeriodo } from "@/core/dre/engine";
import type { Regime } from "@/core/dre/types";
import type { TagMap } from "@/lib/tags";

export const VERSAO_DIMENSOES = "dimensoes/1.0.0";

export type Dimensao = "categoria" | "centro" | "contraparte" | "tag";

export const DIMENSOES: { id: Dimensao; label: string }[] = [
  { id: "categoria", label: "Categoria" },
  { id: "centro", label: "Centro de custo" },
  { id: "contraparte", label: "Cliente / Fornecedor" },
  { id: "tag", label: "Tag customizada" },
];

export interface TransacaoDim {
  id: string;
  data: string;
  rotulo: string;
  categoria: string;
  valor: number;
  tipo: "entrada" | "saida";
}

export interface LinhaPivot {
  chave: string;
  receita: number;
  despesa: number;
  resultado: number;
  n: number;
  transacoes: TransacaoDim[];
}

export interface PivotReport {
  dimensao: Dimensao;
  periodoLabel: string;
  de: string; ate: string; regime: Regime;
  linhas: LinhaPivot[];
  totalReceita: number;
  totalDespesa: number;
  versao: string;
}

const SEM = { categoria: "Sem categoria", centro: "Sem centro de custo", contraparte: "Sem contraparte", tag: "Sem tag" } as const;

/** Chaves da dimensão para um movimento (tag pode ter várias; resto, uma). */
function chavesDe(m: RiskMovement, dim: Dimensao, input: RiskInput, tags: TagMap): string[] {
  if (dim === "categoria") return [m.category || SEM.categoria];
  if (dim === "centro") return [m.costCenter || SEM.centro];
  if (dim === "contraparte") return [(m.party_id && input.partyNames?.[m.party_id]) || SEM.contraparte];
  const ts = tags[m.id] ?? [];
  return ts.length ? ts : [SEM.tag];
}

function rotuloTransacao(m: RiskMovement, input: RiskInput): string {
  const parte = m.party_id ? input.partyNames?.[m.party_id] : undefined;
  return parte || m.category || "Movimentação";
}

export function analisarDimensao(
  input: RiskInput,
  opts: { dim: Dimensao; regime: Regime; de: string; ate: string; periodoLabel: string },
  tags: TagMap,
): PivotReport {
  const { dim, regime, de, ate, periodoLabel } = opts;
  const movs = movimentosNoPeriodo(input, regime, de, ate);
  const mapa = new Map<string, LinhaPivot>();
  let totalReceita = 0, totalDespesa = 0;

  for (const m of movs) {
    if (m.type === "entrada") totalReceita += m.amount; else totalDespesa += m.amount;
    const tx: TransacaoDim = {
      id: m.id,
      data: (regime === "caixa" ? m.paid_date : m.due_date) || m.due_date,
      rotulo: rotuloTransacao(m, input),
      categoria: m.category || "—",
      valor: m.amount,
      tipo: m.type,
    };
    for (const chave of chavesDe(m, dim, input, tags)) {
      let linha = mapa.get(chave);
      if (!linha) { linha = { chave, receita: 0, despesa: 0, resultado: 0, n: 0, transacoes: [] }; mapa.set(chave, linha); }
      if (m.type === "entrada") linha.receita += m.amount; else linha.despesa += m.amount;
      linha.resultado = linha.receita - linha.despesa;
      linha.n++;
      if (linha.transacoes.length < 100) linha.transacoes.push(tx);
    }
  }

  const linhas = Array.from(mapa.values())
    .map((l) => ({ ...l, transacoes: l.transacoes.sort((a, b) => b.valor - a.valor) }))
    .sort((a, b) => Math.abs(b.resultado) - Math.abs(a.resultado) || (b.receita + b.despesa) - (a.receita + a.despesa));

  return { dimensao: dim, periodoLabel, de, ate, regime, linhas, totalReceita, totalDespesa, versao: VERSAO_DIMENSOES };
}
