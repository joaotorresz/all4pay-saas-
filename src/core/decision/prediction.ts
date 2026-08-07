/**
 * Prediction Engine — forecasting probabilístico por Monte Carlo. Em vez
 * de um fluxo projetado linear, simula centenas de trajetórias do caixa
 * (deriva diária com volatilidade) e responde: "X% de chance do caixa
 * ficar negativo até a data Y", com bandas p10/p50/p90.
 */
import type { FinancialFeatures, Prediction, BandaPrevisao } from "./types";

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

const SEMANAS = ["1ª", "2ª", "3ª", "4ª", "5ª"];
const MESES_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function preverCaixa(f: FinancialFeatures, hojeISO: string, horizonteDias = 90, paths = 400): Prediction {
  const meanDia = (f.receitaMensal - f.despesaMensal) / 30;
  const sdDia = Math.max(f.despesaMensal, f.receitaMensal) / 30 * 0.6 + 1;

  // saldo[path][dia]
  const cols: number[][] = Array.from({ length: horizonteDias + 1 }, () => []);
  let negativos = 0;
  const primeirosNeg: number[] = [];

  for (let p = 0; p < paths; p++) {
    const r = rng(1000 + p);
    let saldo = f.saldo;
    cols[0].push(saldo);
    let virouNeg = false;
    for (let d = 1; d <= horizonteDias; d++) {
      saldo += meanDia + gauss(r) * sdDia;
      cols[d].push(saldo);
      if (!virouNeg && saldo < 0) {
        virouNeg = true;
        primeirosNeg.push(d);
      }
    }
    if (virouNeg) negativos++;
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

  const probabilidadeNegativo = negativos / paths;
  const diaProvavel = primeirosNeg.length ? Math.round(median(primeirosNeg)) : null;
  let dataProvavel: string | null = null;
  let semana: string | null = null;
  if (diaProvavel != null) {
    const dt = new Date(base);
    dt.setDate(base.getDate() + diaProvavel);
    dataProvavel = dt.toISOString().slice(0, 10);
    // Semana/mês derivados da data UTC (não de getters locais): em fuso negativo
    // (UTC-3) dt é a meia-noite UTC = dia anterior local, o que jogava a semana e
    // o mês um dia para trás (ex.: "5ª semana de junho" em vez de "1ª de julho").
    const ddP = Number(dataProvavel.slice(8, 10));
    const mmP = Number(dataProvavel.slice(5, 7));
    semana = `${SEMANAS[Math.min(4, Math.floor((ddP - 1) / 7))]} semana de ${MESES_PT[mmP - 1]}`;
  }

  const fim = cols[horizonteDias];
  const texto =
    probabilidadeNegativo < 0.05
      ? `Caixa robusto: <5% de chance de ficar negativo em ${horizonteDias} dias.`
      : `${Math.round(probabilidadeNegativo * 100)}% de chance do caixa ficar negativo até ${semana ?? `${horizonteDias} dias`}.`;

  return {
    horizonteDias,
    probabilidadeNegativo,
    diaProvavelNegativo: diaProvavel,
    dataProvavelNegativo: dataProvavel,
    semanaProvavel: semana,
    caixaFinalP10: pct(fim, 0.1),
    caixaFinalP50: pct(fim, 0.5),
    caixaFinalP90: pct(fim, 0.9),
    bandas,
    texto,
  };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
