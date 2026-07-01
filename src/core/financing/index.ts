/**
 * Simulador de financiamento/empréstimo (puro, tipado, demo-safe).
 *
 * Responde "quanto fica a parcela?" e "quanto custa de verdade?" para um
 * empréstimo/parcelamento — a decisão de crédito mais comum de uma PME.
 * Dois sistemas de amortização clássicos:
 *  • PRICE  — parcela FIXA (o mais comum em crédito ao consumidor/PME);
 *  • SAC    — amortização constante, parcela DECRESCENTE (menos juros no total).
 *
 * Versão financing/1.0.0.
 */

export type SistemaAmortizacao = "price" | "sac";

export interface ParcelaPlano {
  numero: number;
  parcela: number;    // valor pago no mês
  juros: number;      // parte de juros
  amortizacao: number; // parte que abate o principal
  saldo: number;      // saldo devedor após a parcela
}

export interface ResultadoFinanciamento {
  principal: number;
  taxaMensal: number;       // ex.: 0.02 = 2% a.m.
  parcelas: number;
  sistema: SistemaAmortizacao;
  parcela: number;          // PRICE: parcela fixa · SAC: a 1ª (maior)
  parcelaFinal: number;     // PRICE: = parcela · SAC: a última (menor)
  totalPago: number;        // soma de todas as parcelas
  jurosTotal: number;       // totalPago − principal
  custoEfetivoPct: number;  // jurosTotal ÷ principal (× 100 no display)
  plano: ParcelaPlano[];    // a tabela completa
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Simula um financiamento. `taxaMensal` em fração (0.02 = 2% a.m.).
 * Retorna a tabela de amortização e os totais. `taxaMensal = 0` → sem juros.
 */
export function simularFinanciamento(
  principal: number,
  taxaMensal: number,
  parcelas: number,
  sistema: SistemaAmortizacao = "price",
): ResultadoFinanciamento {
  const P = Math.max(0, principal);
  const i = Math.max(0, taxaMensal);
  const n = Math.max(1, Math.floor(parcelas));
  const plano: ParcelaPlano[] = [];

  if (sistema === "sac") {
    const amort = P / n; // amortização constante
    let saldo = P;
    for (let k = 1; k <= n; k++) {
      const juros = saldo * i;
      const parcela = amort + juros;
      saldo = k === n ? 0 : saldo - amort;
      plano.push({ numero: k, parcela: round2(parcela), juros: round2(juros), amortizacao: round2(amort), saldo: round2(Math.max(0, saldo)) });
    }
  } else {
    // PRICE: parcela fixa. PMT = P·i·(1+i)^n / ((1+i)^n − 1); i=0 → P/n.
    const pmt = i === 0 ? P / n : (P * i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
    let saldo = P;
    for (let k = 1; k <= n; k++) {
      const juros = saldo * i;
      let amortizacao = pmt - juros;
      // última parcela: quita o saldo residual (corrige o arredondamento do PMT).
      if (k === n) amortizacao = saldo;
      const parcela = k === n ? juros + amortizacao : pmt;
      saldo = k === n ? 0 : saldo - amortizacao;
      plano.push({ numero: k, parcela: round2(parcela), juros: round2(juros), amortizacao: round2(amortizacao), saldo: round2(Math.max(0, saldo)) });
    }
  }

  const totalPago = round2(plano.reduce((s, p) => s + p.parcela, 0));
  const jurosTotal = round2(totalPago - P);
  return {
    principal: round2(P),
    taxaMensal: i,
    parcelas: n,
    sistema,
    parcela: plano[0]?.parcela ?? 0,
    parcelaFinal: plano[plano.length - 1]?.parcela ?? 0,
    totalPago,
    jurosTotal,
    custoEfetivoPct: P > 0 ? round2((jurosTotal / P) * 100) : 0,
    plano,
  };
}
