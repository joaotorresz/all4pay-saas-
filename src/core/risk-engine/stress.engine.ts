/** Stress testing — simula cenários adversos sobre a projeção de caixa. */
import type { RiskInput, StressCenario, BurnResult } from "./types";
import { recebiveisPonderados, compromissosAbertos } from "./normalize";

function projetarFim(
  input: RiskInput,
  opts: { inflowFactor?: number; outflowFactor?: number; atrasoDias?: number },
): { endSaldo: number; rupturaDia: number | null } {
  const { inflowFactor = 1, outflowFactor = 1, atrasoDias = 0 } = opts;
  const horizon = input.horizonDias ?? 60;
  const recs = recebiveisPonderados(input);
  const pays = compromissosAbertos(input);

  const inflow = new Map<string, number>();
  const outflow = new Map<string, number>();
  for (const r of recs) {
    const d = new Date(r.due_date);
    d.setDate(d.getDate() + atrasoDias);
    const key = d.toISOString().slice(0, 10);
    inflow.set(key, (inflow.get(key) ?? 0) + r.valorEsperado * inflowFactor);
  }
  for (const p of pays)
    outflow.set(p.due_date, (outflow.get(p.due_date) ?? 0) + p.amount * outflowFactor);

  const start = new Date(input.hoje);
  let saldo = input.saldoAtual;
  let rupturaDia: number | null = null;
  for (let i = 0; i <= horizon; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    saldo += (inflow.get(key) ?? 0) - (outflow.get(key) ?? 0);
    if (saldo < 0 && rupturaDia === null) rupturaDia = i;
  }
  return { endSaldo: saldo, rupturaDia };
}

const runwayDias = (saldo: number, receita: number, despesa: number) => {
  const liqDia = (receita - despesa) / 30;
  return liqDia >= 0 ? 999 : Math.max(0, Math.round(saldo / -liqDia));
};

export function simularCenarios(input: RiskInput, burn: BurnResult): StressCenario[] {
  const base = projetarFim(input, {});
  const mk = (
    id: string,
    label: string,
    descricao: string,
    fim: { endSaldo: number },
    rwy: number,
  ): StressCenario => ({
    id,
    label,
    descricao,
    impactoSaldo: fim.endSaldo - base.endSaldo,
    runwayDias: rwy,
  });

  const despAnual = burn.despesaMensal * 12;
  const combustivelShare = 0.25; // proxy do custo sensível a combustível
  const impactoCombustivel = -0.18 * combustivelShare * despAnual;

  return [
    mk(
      "receita-20",
      "Queda de 20% na receita",
      "Recebíveis previstos reduzidos em 20%.",
      projetarFim(input, { inflowFactor: 0.8 }),
      runwayDias(input.saldoAtual, burn.receitaMensal * 0.8, burn.despesaMensal),
    ),
    mk(
      "atraso-30",
      "Atraso de 30 dias nos recebíveis",
      "Todos os recebíveis em aberto entram 30 dias depois.",
      projetarFim(input, { atrasoDias: 30 }),
      runwayDias(input.saldoAtual, burn.receitaMensal, burn.despesaMensal),
    ),
    mk(
      "despesa-10",
      "Aumento de 10% nas despesas",
      "Saídas em aberto 10% maiores.",
      projetarFim(input, { outflowFactor: 1.1 }),
      runwayDias(input.saldoAtual, burn.receitaMensal, burn.despesaMensal * 1.1),
    ),
    {
      id: "combustivel-18",
      label: "Combustível +18%",
      descricao: "Impacto anual estimado sobre o resultado (≈25% da despesa é sensível).",
      impactoSaldo: impactoCombustivel,
      runwayDias: runwayDias(
        input.saldoAtual,
        burn.receitaMensal,
        burn.despesaMensal + (-impactoCombustivel) / 12,
      ),
    },
  ];
}
