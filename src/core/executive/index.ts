/**
 * centroInteligencia() — orquestra a IA executiva ponta a ponta:
 * contexto → anomalias → forecast → insights priorizados → briefing →
 * memória. Reaproveita os motores quant / risco / crédito (1 execução).
 * Puro, demo-safe, auditável (versão de modelo).
 */
import type { RiskInput } from "@/core/risk-engine/types";
import type { CentroInteligencia } from "./types";
import { VERSAO_EXECUTIVO } from "./types";
import { rodarMotores, construirContexto } from "./context";
import { detectarAnomalias } from "./anomalies";
import { motorPreditivo } from "./forecast";
import { gerarInsights } from "./insights";
import { executiveBriefing } from "./briefing";
import { memoryEngine } from "./memory";

export function centroInteligencia(input: RiskInput): CentroInteligencia {
  const motores = rodarMotores(input);
  const context = construirContexto(input, motores);
  const anomalias = detectarAnomalias(input);
  const forecast = motorPreditivo(input);
  const insights = gerarInsights(context, anomalias, forecast);
  const briefing = executiveBriefing(context, insights, forecast);
  const memoria = memoryEngine(input, context);

  return {
    context,
    indicadores: motores.quant.indicadores,
    insights,
    briefing,
    anomalias,
    forecast,
    memoria,
    versaoModelo: VERSAO_EXECUTIVO,
  };
}

export { copilotoFinanceiro, PERGUNTAS_SUGERIDAS } from "./copilot";
export { simularCenario } from "./scenario";
export type { CentroInteligencia } from "./types";
export { centroInteligencia as default };
