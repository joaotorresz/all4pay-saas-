/**
 * all4pay — Headcount Planning (`headcount/1.0.0`)
 * ------------------------------------------------
 * Plano de contratações × runway (benchmark Runway.com): cada contratação
 * entra com o CUSTO REAL de folha (salário + 13º + férias+1/3 + FGTS, via
 * `core/payroll`) a partir do mês escolhido, e o motor projeta caixa mês a
 * mês, runway e score antes/depois (reusa `simularCenario`). Puro, tipado,
 * demo-safe.
 */
import type { IndicadoresFinanceiros } from "@/core/quant/types";
import { simularCenario } from "@/core/executive/scenario";
import type { ScenarioResultado } from "@/core/executive/types";
import { provisaoTrabalhista } from "@/core/payroll";

export const VERSAO_HEADCOUNT = "headcount/1.0.0";

export interface Contratacao {
  id: string;
  cargo: string;
  salario: number; // mensal, bruto
  quantidade: number;
  mesInicio: number; // 1..12 (meses a partir de hoje)
}

export interface MesProjecao {
  mes: number; // 1..12
  custoFolhaNovo: number; // custo mensal das contratações ativas no mês
  liquido: number; // líquido do mês com as contratações
  caixa: number; // caixa projetado ao fim do mês
}

export interface PlanoHeadcount {
  custoMensalPlano: number; // custo recorrente total (todas contratadas)
  custoAnualPlano: number; // custo no 1º ano considerando os meses de início
  pessoas: number;
  antes: { runwayMeses: number; burn: number; score: number };
  depois: ScenarioResultado;
  serie: MesProjecao[]; // 12 meses
  mesAperto: number | null; // 1º mês com caixa projetado negativo
  versaoModelo: string;
}

/** Custo mensal REAL de 1 contratação (salário + provisões, sem beneficios). */
export function custoMensalContratacao(salario: number): number {
  const p = provisaoTrabalhista(salario);
  return p.custoAnualFolha / 12;
}

export function planejarContratacoes(
  indic: IndicadoresFinanceiros,
  saldoAtual: number,
  scoreAtual: number,
  plano: Contratacao[],
): PlanoHeadcount {
  const ativas = plano.filter((c) => c.salario > 0 && c.quantidade > 0);
  const custoDe = (c: Contratacao) => custoMensalContratacao(c.salario) * c.quantidade;
  const custoMensalPlano = ativas.reduce((s, c) => s + custoDe(c), 0);

  const liquidoBase = indic.receitaMensal - indic.despesaMensal;
  const serie: MesProjecao[] = [];
  let caixa = saldoAtual;
  let custoAnualPlano = 0;
  let mesAperto: number | null = null;
  for (let mes = 1; mes <= 12; mes++) {
    const custoFolhaNovo = ativas
      .filter((c) => c.mesInicio <= mes)
      .reduce((s, c) => s + custoDe(c), 0);
    const liquido = liquidoBase - custoFolhaNovo;
    caixa += liquido;
    custoAnualPlano += custoFolhaNovo;
    if (mesAperto === null && caixa < 0) mesAperto = mes;
    serie.push({ mes, custoFolhaNovo, liquido, caixa });
  }

  // estado-regime (todas contratadas) → runway/score/burn projetados
  const depois = simularCenario(indic, saldoAtual, { folhaDelta: custoMensalPlano });

  return {
    custoMensalPlano,
    custoAnualPlano,
    pessoas: ativas.reduce((s, c) => s + c.quantidade, 0),
    antes: { runwayMeses: indic.runwayMeses, burn: indic.burnRate, score: scoreAtual },
    depois,
    serie,
    mesAperto,
    versaoModelo: VERSAO_HEADCOUNT,
  };
}
