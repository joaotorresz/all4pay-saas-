/**
 * Financial Data Lake (coorte sintética anonimizada) — o substrato do
 * moat. Centenas de empresas com features estruturadas + desfecho
 * histórico (escalou/saudável/stress/quebrou). Determinística (RNG
 * semeado) para reprodutibilidade. Em produção, isto vira a base
 * cross-tenant real (anonimizada).
 */
import type { EmpresaCoorte, Setor, Faixa, Desfecho } from "./types";

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Perfil médio por setor (gera distribuições realistas). */
const PERFIS: Record<Setor, { margem: number; runway: number; burnMult: number; inad: number; conc: number; vol: number; cresc: number; rec: number }> = {
  eventos: { margem: 0.15, runway: 5.2, burnMult: 1.6, inad: 0.1, conc: 0.35, vol: 0.55, cresc: 0.04, rec: 0.3 },
  saas: { margem: 0.22, runway: 12, burnMult: 1.1, inad: 0.04, conc: 0.2, vol: 0.25, cresc: 0.06, rec: 0.8 },
  varejo: { margem: 0.08, runway: 6, burnMult: 1.4, inad: 0.06, conc: 0.18, vol: 0.4, cresc: 0.02, rec: 0.4 },
  fintech: { margem: 0.18, runway: 9, burnMult: 1.5, inad: 0.08, conc: 0.25, vol: 0.45, cresc: 0.07, rec: 0.6 },
  servicos: { margem: 0.12, runway: 7, burnMult: 1.3, inad: 0.09, conc: 0.3, vol: 0.35, cresc: 0.03, rec: 0.5 },
};
const SETORES: Setor[] = ["eventos", "saas", "varejo", "fintech", "servicos"];
const FAIXAS: { faixa: Faixa; fat: number }[] = [
  { faixa: "<5M", fat: 3_000_000 },
  { faixa: "5-20M", fat: 12_000_000 },
  { faixa: "20-50M", fat: 32_000_000 },
  { faixa: "50M+", fat: 80_000_000 },
];

/** Risco latente que rotula o desfecho (sinal aprendível pelo modelo). */
function stressLatente(e: { margem: number; runwayMeses: number; burnMultiple: number; inadimplencia: number; concentracao: number; volatilidade: number; crescimento: number }): number {
  const nRunway = clamp01((18 - e.runwayMeses) / 16);
  const nBurn = clamp01(e.burnMultiple / 3);
  const nMargem = clamp01((0.3 - e.margem) / 0.3);
  return clamp01(
    0.3 * nRunway + 0.22 * e.inadimplencia * 1.5 + 0.18 * nBurn + 0.15 * nMargem + 0.1 * e.volatilidade + 0.05 * e.concentracao,
  );
}

function desfechoDe(stress: number, crescimento: number): Desfecho {
  if (stress > 0.6) return "quebrou";
  if (stress > 0.45) return "stress";
  if (stress < 0.3 && crescimento > 0.05) return "escalou";
  return "saudavel";
}

let _cache: EmpresaCoorte[] | null = null;

export function coorte(): EmpresaCoorte[] {
  if (_cache) return _cache;
  const r = rng(20260609);
  const n = 320;
  const out: EmpresaCoorte[] = [];
  const gauss = () => (r() + r() + r() - 1.5) / 1.5; // ~N(0,1) aproximado

  for (let i = 0; i < n; i++) {
    const setor = SETORES[Math.floor(r() * SETORES.length)];
    const fx = FAIXAS[Math.floor(r() * FAIXAS.length)];
    const p = PERFIS[setor];
    const margem = clamp01(p.margem + gauss() * 0.08);
    const runwayMeses = Math.max(0.5, p.runway + gauss() * 4);
    const burnMultiple = Math.max(0, p.burnMult + gauss() * 0.6);
    const inadimplencia = clamp01(p.inad + gauss() * 0.06);
    const concentracao = clamp01(p.conc + gauss() * 0.12);
    const volatilidade = clamp01(p.vol + gauss() * 0.15);
    const crescimento = p.cresc + gauss() * 0.05;
    const liquidez = Math.max(0.3, 1.2 + gauss() * 0.8);
    const recorrencia = clamp01(p.rec + gauss() * 0.15);
    const ticketMedio = Math.max(500, (fx.fat / 12 / 20) * (1 + gauss() * 0.3));

    const s = stressLatente({ margem, runwayMeses, burnMultiple, inadimplencia, concentracao, volatilidade, crescimento });
    // ruído na rotulagem (mantém sinal aprendível mas não trivial)
    const sNoisy = clamp01(s + gauss() * 0.08);
    const desfecho = desfechoDe(sNoisy, crescimento);
    const stress: 0 | 1 = desfecho === "stress" || desfecho === "quebrou" ? 1 : 0;

    out.push({
      id: `co_${i}`,
      setor,
      faixa: fx.faixa,
      faturamentoAnual: fx.fat,
      margem,
      runwayMeses,
      burnMultiple,
      inadimplencia,
      concentracao,
      volatilidade,
      crescimento,
      liquidez,
      recorrencia,
      ticketMedio,
      desfecho,
      stress,
    });
  }
  _cache = out;
  return out;
}

/** Ordem canônica das features usadas pelos modelos. */
export const FEATURE_KEYS: (keyof import("./types").EmpresaFeatures)[] = [
  "margem",
  "runwayMeses",
  "burnMultiple",
  "inadimplencia",
  "concentracao",
  "volatilidade",
  "crescimento",
  "liquidez",
  "recorrencia",
];
