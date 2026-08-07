/**
 * Calculadora de investimento/poupança (pura, tipada) — versão investment/1.0.0.
 *
 * Responde duas perguntas concretas de dono de PME:
 *  • "se eu guardar X por mês rendendo T%, quanto tenho em N meses?" (valor
 *    futuro de um aporte inicial + aportes mensais — juros compostos);
 *  • "em quanto tempo um investimento se paga?" (payback).
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface ValorFuturo {
  principal: number;      // aporte inicial
  aporteMensal: number;   // depósito por mês
  taxaMensal: number;     // fração (0.01 = 1% a.m.)
  meses: number;
  totalAportado: number;  // principal + aporteMensal·meses
  montante: number;       // valor futuro (com juros)
  jurosGanhos: number;    // montante − totalAportado
}

/**
 * Valor futuro de um aporte inicial + aportes mensais constantes, a juros
 * compostos. FV = P·(1+i)^n + PMT·((1+i)^n − 1)/i ; i=0 → P + PMT·n.
 */
export function valorFuturo(principal: number, aporteMensal: number, taxaMensal: number, meses: number): ValorFuturo {
  const P = Math.max(0, principal);
  const PMT = Math.max(0, aporteMensal);
  const i = Math.max(0, taxaMensal);
  const n = Math.max(0, Math.floor(meses));
  const fator = Math.pow(1 + i, n);
  const montante = i === 0 ? P + PMT * n : P * fator + PMT * ((fator - 1) / i);
  const totalAportado = P + PMT * n;
  return {
    principal: round2(P),
    aporteMensal: round2(PMT),
    taxaMensal: i,
    meses: n,
    totalAportado: round2(totalAportado),
    montante: round2(montante),
    jurosGanhos: round2(montante - totalAportado),
  };
}

export interface TempoParaMeta {
  meta: number;           // alvo a juntar
  aporteMensal: number;   // depósito por mês
  taxaMensal: number;     // fração
  principal: number;      // quanto já tem hoje
  meses: number;          // meses até atingir (Infinity se nunca)
  anos: number;
  totalAportado: number;  // principal + aporteMensal·meses
  jurosGanhos: number;    // meta − totalAportado (o que os juros pouparam)
  atingivel: boolean;
}

/**
 * Em quanto tempo se junta uma META guardando um aporte mensal a juros
 * compostos, partindo de `principal` (default 0). Resolve o n de
 * FV = P·(1+i)^n + PMT·((1+i)^n−1)/i = meta:
 *   (1+i)^n = (meta + PMT/i) ÷ (P + PMT/i)  → n = ln(·)/ln(1+i);  i=0 → (meta−P)/PMT.
 * Arredonda o mês para cima (só se atinge a meta no mês cheio).
 */
export function tempoParaMeta(meta: number, aporteMensal: number, taxaMensal = 0, principal = 0): TempoParaMeta {
  const alvo = Math.max(0, meta);
  const PMT = Math.max(0, aporteMensal);
  const i = Math.max(0, taxaMensal);
  const P = Math.max(0, principal);
  const base = { meta: round2(alvo), aporteMensal: round2(PMT), taxaMensal: i, principal: round2(P) };

  if (P >= alvo) return { ...base, meses: 0, anos: 0, totalAportado: round2(P), jurosGanhos: 0, atingivel: true };
  // Sem aporte e sem rendimento que cubra a diferença → nunca chega.
  if (PMT === 0 && i === 0) return { ...base, meses: Infinity, anos: Infinity, totalAportado: round2(P), jurosGanhos: 0, atingivel: false };

  let n: number;
  if (i === 0) {
    n = (alvo - P) / PMT;
  } else {
    const num = alvo + PMT / i;
    const den = P + PMT / i;
    n = Math.log(num / den) / Math.log(1 + i);
  }
  const meses = Math.max(0, Math.ceil(n));
  const totalAportado = P + PMT * meses;
  return {
    ...base,
    meses,
    anos: round2(meses / 12),
    totalAportado: round2(totalAportado),
    jurosGanhos: round2(Math.max(0, alvo - totalAportado)), // o que os juros pouparam: meta − o que você depositou
    atingivel: Number.isFinite(meses),
  };
}

export interface Payback {
  investimento: number;
  retornoMensal: number;
  meses: number;          // Infinity se retorno ≤ 0
  anos: number;
  paga: boolean;
}

/** Tempo (meses) até um investimento se pagar pelo retorno mensal que gera. */
export function payback(investimento: number, retornoMensal: number): Payback {
  const inv = Math.max(0, investimento);
  const ret = retornoMensal;
  if (ret <= 0) return { investimento: round2(inv), retornoMensal: round2(ret), meses: Infinity, anos: Infinity, paga: false };
  const meses = inv / ret;
  return { investimento: round2(inv), retornoMensal: round2(ret), meses: round2(meses), anos: round2(meses / 12), paga: true };
}
