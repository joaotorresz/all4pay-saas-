/**
 * analisarQuantitativo() — orquestra a camada quantitativa.
 * Lançamentos → indicadores → score → radar → temporal → preditivo →
 * benchmark → IA executiva. Puro, demo-safe, auditável (versão de modelo).
 */
import type { RiskInput } from "@/core/risk-engine/types";
import type { DiagnosticoQuantitativo } from "./types";
import { VERSAO_QUANT } from "./types";
import { calcularIndicadores } from "./indicators";
import { scoreSaudeFinanceira, radarExecutivo, cenariosPreditivos } from "./score";
import { motorBenchmarking, type Setor } from "./benchmark";
import { narrativaExecutiva } from "./narrative";
import { serieMensal } from "./series";

export function analisarQuantitativo(
  input: RiskInput,
  setor: Setor = "pme",
): DiagnosticoQuantitativo {
  const indicadores = calcularIndicadores(input);
  const { score, temporal } = scoreSaudeFinanceira(input, indicadores);
  const radar = radarExecutivo(indicadores);
  const cenarios = cenariosPreditivos(input, indicadores);
  const benchmark = motorBenchmarking(indicadores, setor);
  const serie = serieMensal(input).map((p) => ({
    label: p.label,
    receita: p.receita,
    despesa: p.despesa,
    liquido: p.liquido,
  }));

  return {
    hoje: input.hoje,
    indicadores,
    score,
    radar,
    serie,
    scoreTemporal: temporal,
    cenarios,
    benchmark,
    narrativa: narrativaExecutiva(indicadores, score, cenarios),
    versaoModelo: VERSAO_QUANT,
  };
}

export type { DiagnosticoQuantitativo } from "./types";
export { analisarQuantitativo as default };
