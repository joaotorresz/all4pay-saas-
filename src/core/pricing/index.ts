/**
 * Calculadora de precificação (pura, tipada, demo-safe) — versão pricing/1.0.0.
 *
 * A dúvida nº 1 de quem vende: "por quanto vender?". Resolve a confusão clássica
 * entre MARGEM (sobre o preço de venda) e MARKUP (sobre o custo), que são coisas
 * diferentes e muita gente troca — vender com "30% em cima do custo" NÃO dá 30%
 * de margem.
 */

export interface Precificacao {
  custo: number;
  preco: number;
  margem: number;        // fração sobre o PREÇO (0.30 = 30%)
  markup: number;        // fração sobre o CUSTO (0.30 = 30%)
  lucroUnitario: number; // preco − custo
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Preço a partir do custo e da MARGEM desejada (sobre o preço de venda). */
export function precoPorMargem(custo: number, margemDesejada: number): Precificacao {
  const c = Math.max(0, custo);
  const m = Math.min(0.999, Math.max(0, margemDesejada)); // margem < 100%
  const preco = round2(c / (1 - m));
  const markup = c > 0 ? (preco - c) / c : 0;
  return { custo: round2(c), preco, margem: round2(m * 100) / 100, markup: round2(markup * 100) / 100, lucroUnitario: round2(preco - c) };
}

/** Preço a partir do custo e do MARKUP (sobre o custo). */
export function precoPorMarkup(custo: number, markupDesejado: number): Precificacao {
  const c = Math.max(0, custo);
  const mk = Math.max(0, markupDesejado);
  const preco = round2(c * (1 + mk));
  const margem = preco > 0 ? (preco - c) / preco : 0;
  return { custo: round2(c), preco, margem: round2(margem * 100) / 100, markup: round2(mk * 100) / 100, lucroUnitario: round2(preco - c) };
}

export interface PontoEquilibrioUnidades {
  custoFixo: number;
  margemUnitaria: number; // margem de contribuição por unidade (preço − custo variável)
  unidades: number;       // quantas vender p/ empatar (Infinity se margem ≤ 0)
  faturamentoEquilibrio: number; // unidades × preço (se preço informado)
}

/**
 * Ponto de equilíbrio em UNIDADES: custo fixo ÷ margem de contribuição unitária.
 * `precoUnitario` opcional só para calcular o faturamento no equilíbrio.
 */
export function pontoEquilibrioUnidades(custoFixo: number, margemUnitaria: number, precoUnitario = 0): PontoEquilibrioUnidades {
  const cf = Math.max(0, custoFixo);
  const mc = margemUnitaria;
  const unidades = mc > 0 ? Math.ceil(cf / mc) : Infinity;
  return {
    custoFixo: round2(cf),
    margemUnitaria: round2(mc),
    unidades,
    faturamentoEquilibrio: Number.isFinite(unidades) && precoUnitario > 0 ? round2(unidades * precoUnitario) : 0,
  };
}

export interface PrecoComImpostos {
  custo: number;
  aliquotaImposto: number; // fração sobre o PREÇO (0.06 = 6%)
  margemLiquida: number;   // fração LÍQUIDA desejada sobre o PREÇO
  preco: number;           // preço de venda que embute imposto + margem
  imposto: number;         // R$ de imposto no preço
  lucroLiquido: number;    // R$ que sobra depois de custo e imposto
  viavel: boolean;         // false se margem + imposto ≥ 100% (impossível)
}

/**
 * Gross-up: por quanto vender um custo para ficar com uma MARGEM LÍQUIDA alvo
 * DEPOIS do imposto sobre a venda. O imposto (Simples/ISS/ICMS…) incide sobre o
 * PREÇO, então não basta somar — tem que embutir. Preço = custo ÷ (1 − margem −
 * alíquota). Se margem + alíquota ≥ 100%, é matematicamente impossível.
 */
export function precoComImpostos(custo: number, aliquotaImposto: number, margemLiquida: number): PrecoComImpostos {
  const c = Math.max(0, custo);
  const t = Math.min(0.999, Math.max(0, aliquotaImposto));
  const m = Math.max(0, margemLiquida);
  const denom = 1 - m - t;
  const viavel = denom > 0;
  const preco = viavel ? round2(c / denom) : 0;
  const imposto = round2(preco * t);
  return {
    custo: round2(c),
    aliquotaImposto: Math.round(t * 1e4) / 1e4,
    margemLiquida: Math.round(m * 1e4) / 1e4,
    preco,
    imposto,
    lucroLiquido: round2(preco - c - imposto),
    viavel,
  };
}

/** Margem e markup REALIZADOS a partir do custo e do preço praticado. */
export function analisarPreco(custo: number, preco: number): Precificacao {
  const c = Math.max(0, custo);
  const p = Math.max(0, preco);
  const margem = p > 0 ? (p - c) / p : 0;
  const markup = c > 0 ? (p - c) / c : 0;
  return { custo: round2(c), preco: round2(p), margem: round2(margem * 100) / 100, markup: round2(markup * 100) / 100, lucroUnitario: round2(p - c) };
}
