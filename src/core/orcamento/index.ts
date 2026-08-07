/**
 * ORÇAMENTO — planejamento por categoria e mês, e a ponte para o realizado.
 *
 * O orçamento é digitado por CATEGORIA (é assim que alguém planeja: "folha,
 * 40 mil por mês"), mas o relatório compara por LINHA DA CASCATA (Despesas
 * Operacionais). O elo entre os dois é `orcadoPorLinha`, que roda a MESMA
 * classificação do `core/relatorios` sobre um movimento sintético da categoria.
 * Sem esse elo, o previsto e o realizado seriam duas contas paralelas e
 * divergiriam no primeiro ajuste de regra.
 *
 * Puro, tipado, demo-safe. Versão orcamento/1.0.0.
 */
import type { RiskMovement } from "@/core/risk-engine/types";
import {
  mesesDoIntervalo, type Intervalo, type LinhaEstrutura, type LinhaOrcada,
} from "@/core/relatorios";

export const ORCAMENTO_VERSION = "orcamento/1.0.0";

export type RegimeOrcamento = "competencia" | "caixa";
export type FormatoOrcamento = "detalhado" | "resumido";

/** Uma linha da alocação: a categoria e quanto se planeja em cada mês. */
export interface AlocacaoCategoria {
  categoria: string;
  /** "entrada" = receita orçada; "saida" = despesa orçada. */
  tipo: "entrada" | "saida";
  /** Valor por mês, na ordem de `mesesDoIntervalo(periodo)`. */
  valores: number[];
}

export interface Orcamento {
  id: string;
  nome: string;
  periodo: Intervalo;
  regime: RegimeOrcamento;
  formato: FormatoOrcamento;
  projeto: string | null;
  centro: string | null;
  descricao: string;
  alocacoes: AlocacaoCategoria[];
  criadoEm: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/* ================================ validação ================================ */

export function validarOrcamento(o: Partial<Orcamento>): Record<string, string> {
  const e: Record<string, string> = {};
  if (!o.nome?.trim()) e.nome = "Informe o nome do orçamento.";
  if (!o.periodo?.de || !o.periodo?.ate) e.periodo = "Selecione o período.";
  else if (o.periodo.ate < o.periodo.de) e.periodo = "A data final é anterior à inicial.";
  else if (mesesDoIntervalo(o.periodo).length > 36) e.periodo = "O período não pode passar de 36 meses.";
  if (!o.regime) e.regime = "Selecione o regime.";
  if (!o.formato) e.formato = "Selecione o formato.";
  return e;
}

/* =============================== a alocação =============================== */

/** Ano do orçamento — o que a busca da lista usa. */
export const anoDoOrcamento = (o: Orcamento): string => o.periodo.de.slice(0, 4);

export const mesesDoOrcamento = (o: Orcamento): string[] => mesesDoIntervalo(o.periodo);

/** Total planejado de uma linha (soma dos meses). */
export const totalAlocacao = (a: AlocacaoCategoria): number =>
  round2(a.valores.reduce((s, v) => s + (Number(v) || 0), 0));

export interface ResumoOrcamento {
  receita: number;
  despesa: number;
  resultado: number;
  categorias: number;
  meses: number;
}

export function resumoOrcamento(o: Orcamento): ResumoOrcamento {
  const receita = round2(o.alocacoes.filter((a) => a.tipo === "entrada").reduce((s, a) => s + totalAlocacao(a), 0));
  const despesa = round2(o.alocacoes.filter((a) => a.tipo === "saida").reduce((s, a) => s + totalAlocacao(a), 0));
  return {
    receita, despesa, resultado: round2(receita - despesa),
    categorias: o.alocacoes.filter((a) => a.categoria.trim()).length,
    meses: mesesDoOrcamento(o).length,
  };
}

/**
 * Ajusta o número de colunas quando o PERÍODO muda depois da alocação já
 * preenchida. Encurtar corta os meses do fim; alongar acrescenta zeros. O que
 * não pode acontecer é o array ficar com tamanho diferente do de meses — as
 * colunas passariam a mostrar o valor do mês errado, calada.
 */
export function ajustarAlocacoes(alocacoes: AlocacaoCategoria[], nMeses: number): AlocacaoCategoria[] {
  return alocacoes.map((a) => {
    const v = a.valores.slice(0, nMeses);
    while (v.length < nMeses) v.push(0);
    return { ...a, valores: v };
  });
}

/**
 * Distribui um total ANUAL igualmente pelos meses, com o resto no último mês.
 * Sem isso, 100 dividido por 3 daria 33,33 × 3 = 99,99 e o orçamento nasceria
 * com um centavo a menos que o total digitado.
 */
export function distribuir(total: number, nMeses: number): number[] {
  if (nMeses <= 0) return [];
  const base = Math.floor((total / nMeses) * 100) / 100;
  const v = Array.from({ length: nMeses }, () => base);
  v[nMeses - 1] = round2(total - base * (nMeses - 1));
  return v;
}

/* ========================== a ponte com o relatório ========================== */

/**
 * Converte a alocação POR CATEGORIA nas linhas da cascata do relatório.
 *
 * Cada categoria orçada vira um movimento sintético (tipo + categoria) e passa
 * pelo MESMO classificador da estrutura — o primeiro `casa` que aceita vence,
 * exatamente como o realizado. É isso que garante que "Folha de Pagamento"
 * orçada caia em Despesas Operacionais tanto no previsto quanto no realizado.
 *
 * As linhas "=" da cascata são derivadas depois, pela própria fórmula, para o
 * orçado somar igual ao realizado.
 */
export function orcadoPorLinha(
  o: Orcamento,
  estrutura: LinhaEstrutura[],
  colunas: string[],
): LinhaOrcada[] {
  const mesesOrc = mesesDoOrcamento(o);
  const porLinha = new Map<string, number[]>();
  for (const l of estrutura) porLinha.set(l.id, colunas.map(() => 0));

  for (const a of o.alocacoes) {
    if (!a.categoria.trim()) continue;
    // O movimento sintético existe só para ser classificado — nunca é somado
    // a lugar nenhum nem confundido com um lançamento real.
    const sintetico = { type: a.tipo, category: a.categoria, amount: 1, status: "pago" } as RiskMovement;
    const linha = estrutura.find((l) => l.tipo === "soma" && l.casa?.(sintetico));
    if (!linha) continue;
    const alvo = porLinha.get(linha.id)!;
    mesesOrc.forEach((m, k) => {
      const col = colunas.indexOf(m);
      if (col < 0) return; // mês do orçamento fora da janela do relatório
      const v = Number(a.valores[k]) || 0;
      alvo[col] += linha.sinal === "+/-" ? (a.tipo === "entrada" ? v : -v) : v;
    });
  }

  // As linhas "=" saem das fórmulas, na ordem da cascata.
  for (const l of estrutura) {
    if (l.tipo !== "total") continue;
    porLinha.set(l.id, colunas.map((_, k) =>
      (l.formula ?? []).reduce((s, p) => s + p.sinal * (porLinha.get(p.id)?.[k] ?? 0), 0)));
  }

  return Array.from(porLinha, ([id, valores]) => ({ id, valores: valores.map(round2) }));
}

/**
 * O orçamento cobre a janela do relatório? Comparar dezembro contra um
 * orçamento que termina em outubro produziria "realizado sem previsto" sem o
 * usuário entender por quê.
 */
export function cobertura(o: Orcamento, colunas: string[]): { cobertos: number; total: number } {
  const meses = new Set(mesesDoOrcamento(o));
  return { cobertos: colunas.filter((c) => meses.has(c)).length, total: colunas.length };
}

/** Sugestão de categorias para começar a alocação, a partir do realizado. */
export function sugerirCategorias(
  movimentos: { type: "entrada" | "saida"; category?: string | null }[],
): { categoria: string; tipo: "entrada" | "saida" }[] {
  const vistas = new Map<string, "entrada" | "saida">();
  for (const m of movimentos) {
    const c = (m.category ?? "").trim();
    if (!c) continue;
    if (!vistas.has(c)) vistas.set(c, m.type);
  }
  return Array.from(vistas, ([categoria, tipo]) => ({ categoria, tipo }))
    .sort((a, b) => (a.tipo === b.tipo ? a.categoria.localeCompare(b.categoria) : a.tipo === "entrada" ? -1 : 1));
}
