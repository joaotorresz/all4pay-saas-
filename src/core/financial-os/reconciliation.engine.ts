/**
 * Reconciliation Engine — transforma múltiplas entradas financeiras em
 * 1 transação validada. Matching PROBABILÍSTICO (nunca `valor == valor`):
 * cada variável tem peso; o confidence score decide auto / sugestão / fila.
 */
import type {
  FinancialTransaction,
  MatchResult,
  MatchBreakdown,
  ReconciliationResult,
} from "./types";
import { limparContraparte } from "./gateway";

const PESOS = { valor: 0.35, data: 0.25, documento: 0.2, contraparte: 0.15, categoria: 0.05 };

const simValor = (a: number, b: number) =>
  a === 0 && b === 0 ? 1 : 1 - Math.min(1, Math.abs(a - b) / Math.max(a, b));

const simData = (a: string, b: string) => {
  const ms = +new Date(a) - +new Date(b);
  if (!Number.isFinite(ms)) return 0; // data ausente/inválida não deve virar NaN no confidence
  return Math.max(0, 1 - Math.abs(ms) / 86_400_000 / 15); // tolera até ~15 dias
};

const simTexto = (a?: string, b?: string) => {
  if (!a || !b) return 0;
  const A = limparContraparte(a), B = limparContraparte(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  if (A.includes(B) || B.includes(A)) return 0.85;
  const ta = new Set(A.split(" ")), tb = B.split(" ");
  const inter = tb.filter((t) => ta.has(t)).length;
  return inter / Math.max(ta.size, tb.length);
};

const simDoc = (a?: string, b?: string) =>
  a && b ? (a === b ? 1 : a.includes(b) || b.includes(a) ? 0.8 : 0) : 0;

export function pontuarMatch(
  tx: FinancialTransaction,
  ledger: FinancialTransaction,
): { confidence: number; breakdown: MatchBreakdown } {
  const breakdown: MatchBreakdown = {
    valor: simValor(tx.valor, ledger.valor),
    data: simData(tx.data, ledger.data),
    documento: simDoc(tx.documento, ledger.documento),
    contraparte: simTexto(tx.contraparte, ledger.contraparte),
    categoria: tx.categoria && ledger.categoria ? (tx.categoria === ledger.categoria ? 1 : 0) : 0,
  };
  const confidence =
    (breakdown.valor * PESOS.valor +
      breakdown.data * PESOS.data +
      breakdown.documento * PESOS.documento +
      breakdown.contraparte * PESOS.contraparte +
      breakdown.categoria * PESOS.categoria) *
    100;
  return { confidence: Math.round(confidence), breakdown };
}

const decidir = (c: number): MatchResult["decisao"] =>
  c >= 90 ? "auto" : c >= 70 ? "sugestao" : "manual";

/**
 * reconciliarAutomaticamente — para cada transação da fonte, encontra o
 * melhor lançamento no ledger (mesmo tipo), pontua e roteia para a fila
 * correta. Cada lançamento só casa uma vez (greedy por maior confidence).
 */
export function reconciliarAutomaticamente(
  feed: FinancialTransaction[],
  ledger: FinancialTransaction[],
): ReconciliationResult {
  const usados = new Set<string>();
  const results: MatchResult[] = [];

  // ordena por melhor par possível primeiro para um greedy estável
  const candidatos = feed
    .map((tx) => {
      let best: { ledger: FinancialTransaction; confidence: number; breakdown: MatchBreakdown } | null = null;
      for (const lg of ledger) {
        if (lg.tipo !== tx.tipo) continue;
        const { confidence, breakdown } = pontuarMatch(tx, lg);
        if (!best || confidence > best.confidence) best = { ledger: lg, confidence, breakdown };
      }
      return { tx, best };
    })
    .sort((a, b) => (b.best?.confidence ?? 0) - (a.best?.confidence ?? 0));

  for (const { tx } of candidatos) {
    // Recomputa o melhor entre os lançamentos AINDA não usados: o pré-cálculo
    // serviu só para ordenar (o par globalmente mais forte casa primeiro). Se o
    // melhor global de tx já foi consumido por outra transação, tx ainda pode
    // casar com o melhor disponível — sem isso um match único válido cairia
    // direto para a fila manual só por colisão de "melhor par".
    let best: { ledger: FinancialTransaction; confidence: number; breakdown: MatchBreakdown } | null = null;
    for (const lg of ledger) {
      if (lg.tipo !== tx.tipo || usados.has(lg.id)) continue;
      const { confidence, breakdown } = pontuarMatch(tx, lg);
      if (!best || confidence > best.confidence) best = { ledger: lg, confidence, breakdown };
    }
    if (best) {
      usados.add(best.ledger.id);
      results.push({
        transacao: tx,
        ledger: best.ledger,
        confidence: best.confidence,
        breakdown: best.breakdown,
        decisao: decidir(best.confidence),
      });
    } else {
      results.push({
        transacao: tx,
        ledger: null,
        confidence: 0,
        breakdown: { valor: 0, data: 0, documento: 0, contraparte: 0, categoria: 0 },
        decisao: "manual",
      });
    }
  }

  const auto = results.filter((r) => r.decisao === "auto");
  const sugestoes = results.filter((r) => r.decisao === "sugestao");
  const excecoes = results.filter((r) => r.decisao === "manual");
  return {
    auto,
    sugestoes,
    excecoes,
    total: results.length,
    taxaAuto: results.length ? auto.length / results.length : 0,
  };
}
