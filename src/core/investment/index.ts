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
