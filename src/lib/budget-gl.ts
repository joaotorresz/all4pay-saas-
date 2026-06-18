/**
 * Orçado × Realizado (Fase 3) — variância sobre o RAZÃO. O realizado vem dos
 * lançamentos de dupla entrada (dreDoRazao); o orçamento é mensal por conta de
 * resultado. Variância R$/% + sinal (favorável/desfavorável) + narrativa (flux).
 * Orçamento local (demo-safe); tabela `budgets` (live) é evolução.
 */
import { dreDoRazao, type RazaoLancamento } from "@/lib/ledger";
import { PLANO_PADRAO } from "@/core/ledger/chart";

const KEY = "a4p_budget_gl";

/** Orçamento MENSAL por código de conta. */
export type OrcamentoGL = Record<string, number>;
export function loadOrcGL(): OrcamentoGL {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY) || "{}") as OrcamentoGL; } catch { return {}; }
}
export function saveOrcGL(o: OrcamentoGL): void {
  if (typeof window !== "undefined") { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* ignore */ } }
}

export const CONTAS_RESULTADO = PLANO_PADRAO.filter((c) => c.type === "revenue" || c.type === "expense");

export type SinalVar = "favoravel" | "desfavoravel" | "neutro";
export interface VarLinhaGL {
  conta: string; nome: string; tipo: "revenue" | "expense";
  orcado: number; realizado: number; varValor: number; varPct: number; sinal: SinalVar;
}
export interface VarianciaGL {
  de: string; ate: string; meses: number;
  linhas: VarLinhaGL[];
  receitaOrc: number; receitaReal: number;
  despesaOrc: number; despesaReal: number;
  resultadoOrc: number; resultadoReal: number;
  narrativa: string[];
}

function mesesEntre(de: string, ate: string): number {
  const [y1, m1] = de.split("-").map(Number);
  const [y2, m2] = ate.split("-").map(Number);
  return Math.max(1, (y2 - y1) * 12 + (m2 - m1) + 1);
}
const fmt = (v: number) => "R$ " + Math.round(v).toLocaleString("pt-BR");

export function varianciaGL(entries: RazaoLancamento[], de: string, ate: string, orc: OrcamentoGL): VarianciaGL {
  const meses = mesesEntre(de, ate);
  const dre = dreDoRazao(entries, de, ate);
  const real = new Map<string, number>();
  for (const c of [...dre.receitas, ...dre.despesas]) real.set(c.conta, c.valor);

  const linhas: VarLinhaGL[] = CONTAS_RESULTADO.map((c) => {
    const tipo = c.type as "revenue" | "expense";
    const orcado = (orc[c.code] || 0) * meses;
    const realizado = real.get(c.code) || 0;
    const varValor = realizado - orcado;
    const varPct = orcado !== 0 ? varValor / Math.abs(orcado) : realizado !== 0 ? 1 : 0;
    const sinal: SinalVar = Math.abs(varValor) < 1 ? "neutro"
      : tipo === "revenue" ? (varValor > 0 ? "favoravel" : "desfavoravel")
      : (varValor > 0 ? "desfavoravel" : "favoravel");
    return { conta: c.code, nome: c.name, tipo, orcado, realizado, varValor, varPct, sinal };
  });

  const receitaOrc = linhas.filter((l) => l.tipo === "revenue").reduce((s, l) => s + l.orcado, 0);
  const receitaReal = linhas.filter((l) => l.tipo === "revenue").reduce((s, l) => s + l.realizado, 0);
  const despesaOrc = linhas.filter((l) => l.tipo === "expense").reduce((s, l) => s + l.orcado, 0);
  const despesaReal = linhas.filter((l) => l.tipo === "expense").reduce((s, l) => s + l.realizado, 0);
  const resultadoOrc = receitaOrc - despesaOrc;
  const resultadoReal = receitaReal - despesaReal;

  const narrativa: string[] = [];
  const dRes = resultadoReal - resultadoOrc;
  narrativa.push(dRes >= 0
    ? `Resultado ${fmt(resultadoReal)} — ${fmt(Math.abs(dRes))} acima do orçado no período.`
    : `Resultado ${fmt(resultadoReal)} — ${fmt(Math.abs(dRes))} abaixo do orçado no período.`);
  const desf = linhas.filter((l) => l.sinal === "desfavoravel").sort((a, b) => Math.abs(b.varValor) - Math.abs(a.varValor))[0];
  const fav = linhas.filter((l) => l.sinal === "favoravel").sort((a, b) => Math.abs(b.varValor) - Math.abs(a.varValor))[0];
  if (desf) narrativa.push(`Maior desvio desfavorável: ${desf.nome} em ${fmt(desf.realizado)} vs ${fmt(desf.orcado)} orçado (${(desf.varPct * 100).toFixed(0)}%).`);
  if (fav) narrativa.push(`Destaque favorável: ${fav.nome} (${(fav.varPct * 100 >= 0 ? "+" : "")}${(fav.varPct * 100).toFixed(0)}% vs orçado).`);
  return { de, ate, meses, linhas, receitaOrc, receitaReal, despesaOrc, despesaReal, resultadoOrc, resultadoReal, narrativa };
}
