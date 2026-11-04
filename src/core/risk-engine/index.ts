/**
 * scoreRiscoCaixa() — orquestra o motor de risco de caixa.
 * Dados → Normalização → Métricas → Probabilística → Cenários →
 * Score → Narrativa → Alertas. Retorna o diagnóstico completo,
 * rastreável e explicável (ScoreDetalhado).
 */
import type { RiskInput, ScoreDetalhado } from "./types";
import { VERSAO_MODELO } from "./types";
import { calcularBurnRate } from "./burn.engine";
import { calcularLiquidezProjetada, calcularRunway } from "./liquidez.engine";
import { calcularConcentracao } from "./concentracao.engine";
import { calcularRiscoInadimplencia } from "./inadimplencia.engine";
import { calcularSazonalidade } from "./sazonalidade.engine";
import { simularCenarios } from "./stress.engine";
import { calcularScore } from "./score.engine";
import { HORIZONTE_RUPTURA_DIAS } from "./horizonte";
import { narrativaExecutiva } from "@/core/ai/narrativa-financeira";
import { fatoresCriticos } from "@/core/ai/insights";
import { gerarAlertas } from "@/core/ai/alertas";

export function scoreRiscoCaixa(input: RiskInput): ScoreDetalhado {
  const burn = calcularBurnRate(input);
  const { pontos, rupturaDia } = calcularLiquidezProjetada(input);
  const runway = calcularRunway(input.saldoAtual, burn);
  const concentracao = calcularConcentracao(input);
  const inadimplencia = calcularRiscoInadimplencia(input);
  const sazonalidade = calcularSazonalidade(input);
  const stress = simularCenarios(input, burn);
  // A ruptura que entra no score e na chance é a do horizonte FIXO; a projeção
  // da tela (pontos, rupturaDia) segue o período que ela pediu.
  const rupturaNoHorizonte =
    (input.horizonDias ?? HORIZONTE_RUPTURA_DIAS) === HORIZONTE_RUPTURA_DIAS
      ? rupturaDia
      : calcularLiquidezProjetada({ ...input, horizonDias: HORIZONTE_RUPTURA_DIAS }).rupturaDia;
  const sp = calcularScore(input, {
    burn,
    runway,
    rupturaDia: rupturaNoHorizonte,
    concentracao,
    inadimplencia,
    sazonalidade,
  });

  const diag = {
    score: sp.score,
    nivel: sp.nivel,
    probabilidadeRuptura: sp.probabilidadeRuptura,
    runwayDias: sp.runwayDias,
    componentes: sp.componentes,
    runway,
    liquidez: pontos,
    rupturaDia,
    concentracao,
    burn,
    inadimplencia,
    sazonalidade,
    stress,
    versaoModelo: VERSAO_MODELO,
  };

  return {
    ...diag,
    fatoresCriticos: fatoresCriticos(diag),
    narrativa: narrativaExecutiva(diag),
    alertas: gerarAlertas(diag),
    explicacoes: diag.componentes.map(
      (c) => `${c.label}: ${c.detalhe} (peso ${Math.round(c.peso * 100)}%)`,
    ),
  };
}

export type { ScoreRisco, ScoreDetalhado, RiskInput } from "./types";
export { HORIZONTE_RUPTURA_DIAS, ROTULO_HORIZONTE_RUPTURA } from "./horizonte";
export { scoreRiscoCaixa as default };
