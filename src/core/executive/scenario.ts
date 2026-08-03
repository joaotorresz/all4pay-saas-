/**
 * simuladorCenarios() — FP&A inteligente. O usuário simula queda de
 * receita, expansão, contratação, aumento de custo/inadimplência, e o
 * sistema recalcula runway, score, burn, liquidez e ruptura.
 */
import type { IndicadoresFinanceiros } from "@/core/quant/types";
import { scoreDeIndicadores } from "@/core/quant/score";
import type { ScenarioInput, ScenarioResultado } from "./types";
import { runwayDeFluxo, mesesDeRunway } from "@/core/indicadores";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function simularCenario(
  indic: IndicadoresFinanceiros,
  saldoAtual: number,
  sc: ScenarioInput,
): ScenarioResultado {
  const receita = indic.receitaMensal * (1 + (sc.receitaDelta ?? 0));
  const despesa = indic.despesaMensal * (1 + (sc.despesaDelta ?? 0)) + (sc.folhaDelta ?? 0);
  const liquido = receita - despesa;
  const inad = clamp01(indic.inadimplencia + (sc.inadimplenciaDelta ?? 0));
  const margem = receita > 0 ? liquido / receita : 0;
  const burnRate = Math.max(0, -liquido);
  // Fórmula canônica (`core/indicadores`) — um cenário é hipotético, mas o
  // runway de um cenário e o runway real têm de sair da mesma conta.
  const runwayDias = runwayDeFluxo(saldoAtual, liquido);
  const runwayMeses = mesesDeRunway(runwayDias);

  const scoreProjetado = scoreDeIndicadores({
    ...indic,
    receitaMensal: receita,
    despesaMensal: despesa,
    margemOperacional: margem,
    runwayMeses,
    inadimplencia: inad,
  });

  const emDias = liquido >= 0 ? 90 : Math.max(1, Math.min(365, Math.round(runwayDias)));
  const texto =
    liquido >= 0
      ? `Neste cenário a operação segue gerando caixa (${fmt(liquido)}/mês); runway preservado.`
      : `Neste cenário o caixa entra em zona crítica em ${emDias} dias (queima de ${fmt(burnRate)}/mês).`;

  return { runwayMeses, scoreProjetado, burnRate, liquidoMensal: liquido, emDias, texto };
}

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
}
