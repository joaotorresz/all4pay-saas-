/**
 * Prediction Engine — forecasting probabilístico por Monte Carlo. Em vez
 * de um fluxo projetado linear, simula centenas de trajetórias do caixa
 * (deriva diária com volatilidade) e devolve as BANDAS p10/p50/p90.
 *
 * ⚠️ Fase 3.3 (03/11/2026): a simulação NÃO publica mais "X% de chance de
 * ficar negativo" nem a "semana provável". Era a terceira chance de ruptura do
 * produto, em 90 dias, ao lado da do risk-engine em 60. A chance é uma só (a do
 * risk-engine); aqui fica o leque do caixa, no mesmo horizonte.
 */
import type { FinancialFeatures, Prediction, BandaPrevisao } from "./types";
import { HORIZONTE_RUPTURA_DIAS, ROTULO_HORIZONTE_RUPTURA } from "@/core/risk-engine/horizonte";
import { formatBRL } from "@/lib/format";

/** RNG determinístico (mulberry32) — reprodutível. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normal padrão via Box-Muller. */
function gauss(r: () => number): number {
  const u = Math.max(1e-9, r());
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}


export function preverCaixa(f: FinancialFeatures, hojeISO: string, horizonteDias = HORIZONTE_RUPTURA_DIAS, paths = 400): Prediction {
  const meanDia = (f.receitaMensal - f.despesaMensal) / 30;
  const sdDia = Math.max(f.despesaMensal, f.receitaMensal) / 30 * 0.6 + 1;

  // saldo[path][dia]
  const cols: number[][] = Array.from({ length: horizonteDias + 1 }, () => []);

  for (let p = 0; p < paths; p++) {
    const r = rng(1000 + p);
    let saldo = f.saldo;
    cols[0].push(saldo);
    for (let d = 1; d <= horizonteDias; d++) {
      saldo += meanDia + gauss(r) * sdDia;
      cols[d].push(saldo);
    }
  }

  const pct = (arr: number[], q: number) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(q * s.length))];
  };

  const base = new Date(hojeISO);
  const bandas: BandaPrevisao[] = cols.map((col, dia) => {
    const dt = new Date(base);
    dt.setDate(base.getDate() + dia);
    return { dia, data: dt.toISOString().slice(0, 10), p10: pct(col, 0.1), p50: pct(col, 0.5), p90: pct(col, 0.9) };
  });

  const fim = cols[horizonteDias];
  const p10 = pct(fim, 0.1), p50 = pct(fim, 0.5), p90 = pct(fim, 0.9);
  const texto = `Em ${horizonteDias === HORIZONTE_RUPTURA_DIAS ? ROTULO_HORIZONTE_RUPTURA : `${horizonteDias} dias`}, o caixa termina perto de ${formatBRL(p50)}: ${formatBRL(p10)} no cenário pessimista e ${formatBRL(p90)} no otimista.`;

  return {
    horizonteDias,
    caixaFinalP10: p10,
    caixaFinalP50: p50,
    caixaFinalP90: p90,
    bandas,
    texto,
  };
}

