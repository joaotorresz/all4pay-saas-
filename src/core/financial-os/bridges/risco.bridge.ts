/**
 * Ponte Event Bus → Motor de Risco.
 * Ex.: "Combustível +18%" publica `custo_variou` → recalcula o score de
 * risco com a despesa ajustada → emite alerta executivo + `anomalia_detectada`
 * (que as regras podem consumir). Tudo desacoplado, via barramento.
 */
import { scoreRiscoCaixa } from "@/core/risk-engine";
import type { RiskInput } from "@/core/risk-engine/types";
import { formatBRL } from "@/lib/format";
import { rotuloRunwayLido, type LeituraRunway } from "@/core/indicadores";
import type { FinancialEventBus } from "../event-bus";

export interface AlertaExecutivo {
  titulo: string;
  texto: string;
  impactoAnual: number;
  runwayAntes: number;
  runwayDepois: number;
  scoreAntes: number;
  scoreDepois: number;
}

// ⚠️ Era `d >= 999 ? "24+ m"`: o teto do cálculo (999 dias = 33 meses, nem
// 24) lido como medida, e "sem queima" dito como fôlego. Lê a leitura.
const meses = (l: LeituraRunway) => rotuloRunwayLido(l, "m");

/** Recalcula o risco com um choque de custo (% sobre a parcela sensível). */
export function recalcularRiscoPorCusto(
  base: RiskInput,
  variacaoPct: number,
  parcelaSensivel = 0.25,
): AlertaExecutivo {
  const antes = scoreRiscoCaixa(base);
  const fator = 1 + (variacaoPct / 100) * parcelaSensivel;
  const ajustado: RiskInput = {
    ...base,
    movements: base.movements.map((m) =>
      m.type === "saida" ? { ...m, amount: m.amount * fator } : m,
    ),
  };
  const depois = scoreRiscoCaixa(ajustado);
  const deltaMensal = depois.burn.despesaMensal - antes.burn.despesaMensal;
  const impactoAnual = deltaMensal * 12;

  return {
    titulo: `Choque de custo +${variacaoPct}% recalculado`,
    texto:
      `Custo +${variacaoPct}% eleva a despesa operacional em ~${formatBRL(deltaMensal)}/mês ` +
      `(≈${formatBRL(impactoAnual)}/ano). Runway base de ${meses(antes.runway.leitura.base)} → ${meses(depois.runway.leitura.base)}; ` +
      `score ${antes.score} → ${depois.score}.`,
    impactoAnual,
    runwayAntes: antes.runway.base,
    runwayDepois: depois.runway.base,
    scoreAntes: antes.score,
    scoreDepois: depois.score,
  };
}

/** Instala a ponte no barramento; devolve o unsubscribe. */
export function instalarPonteRisco(
  bus: FinancialEventBus,
  base: RiskInput,
  sink: (a: AlertaExecutivo) => void,
): () => void {
  return bus.subscribe("custo_variou", (e) => {
    const v = Number(e.payload.variacaoPct ?? 0);
    const alerta = recalcularRiscoPorCusto(base, v);
    sink(alerta);
    // Reage publicando uma anomalia que as regras podem consumir.
    bus.publish(
      "anomalia_detectada",
      e.entidadeId,
      { titulo: alerta.titulo, impactoAnual: alerta.impactoAnual, variacaoPct: v },
      "alta",
    );
  });
}
