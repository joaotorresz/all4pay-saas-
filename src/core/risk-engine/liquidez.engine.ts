/**
 * Motor de liquidez — projeta o caixa DIARIAMENTE (não só o saldo final),
 * ponderando entradas pela probabilidade de recebimento. Daqui nascem
 * ruptura, runway e o ponto de quebra.
 */
import type { RiskInput, LiquidezPonto, RunwayCenarios, BurnResult } from "./types";
import { recebiveisPonderados, compromissosAbertos } from "./normalize";

// Label DD/MM derivado da CHAVE UTC (não de getters locais): em fuso negativo
// (UTC-3, todo o Brasil) getDate/getMonth de um Date de meia-noite UTC caem no
// dia anterior — o rótulo mostrava a data um dia adiantada. Ver types: `key`.
const labelDe = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}`;

/**
 * Projeção diária:
 *   saldo += entradasProváveis(dia) − saídasFixas(dia)
 * Considera apenas o que está agendado (recebíveis e contas a pagar em
 * aberto). Entradas valem `valor × probabilidade` — nem toda receita
 * prevista vale 100%.
 */
export function calcularLiquidezProjetada(input: RiskInput): {
  pontos: LiquidezPonto[];
  rupturaDia: number | null;
} {
  const horizon = input.horizonDias ?? 60;
  const recs = recebiveisPonderados(input);
  const pays = compromissosAbertos(input);

  const inflow = new Map<string, number>();
  const outflow = new Map<string, number>();
  for (const r of recs)
    inflow.set(r.due_date, (inflow.get(r.due_date) ?? 0) + r.valorEsperado);
  for (const p of pays)
    outflow.set(p.due_date, (outflow.get(p.due_date) ?? 0) + p.amount);

  const start = new Date(input.hoje);
  let saldo = input.saldoAtual;
  let rupturaDia: number | null = null;
  const pontos: LiquidezPonto[] = [];

  for (let i = 0; i <= horizon; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    saldo += (inflow.get(key) ?? 0) - (outflow.get(key) ?? 0);
    const ruptura = saldo < 0;
    if (ruptura && rupturaDia === null) rupturaDia = i;
    pontos.push({ date: key, label: labelDe(key), saldo, ruptura });
  }
  return { pontos, rupturaDia };
}

/** Runway em 3 cenários, a partir do burn mensal e do saldo. */
export function calcularRunway(saldoAtual: number, burn: BurnResult): RunwayCenarios {
  const CAP = 999; // “saudável” quando gera caixa
  const dias = (receita: number, despesa: number) => {
    const liquidoDia = (receita - despesa) / 30;
    if (liquidoDia >= 0) return CAP;
    return Math.max(0, Math.round(saldoAtual / -liquidoDia));
  };
  return {
    base: dias(burn.receitaMensal, burn.despesaMensal),
    pessimista: dias(burn.receitaMensal * 0.8, burn.despesaMensal * 1.1),
    otimista: dias(burn.receitaMensal * 1.1, burn.despesaMensal * 0.95),
  };
}
