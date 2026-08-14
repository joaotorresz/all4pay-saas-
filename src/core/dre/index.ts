/**
 * financialDRE() — orquestra o DRE Intelligence Center: gerencial,
 * financeiro, comparativo, por cliente, por linha, projetado e executivo
 * (com comentário do copiloto). Consome o mesmo RiskInput. Demo-safe.
 */
import type { RiskInput } from "@/core/risk-engine/types";
import { analisarQuantitativo } from "@/core/quant";
import type { DREReport, DREFiltro, Regime, DREExecutivo, DREGerencial, DREFinanceiro, DREClienteLinha } from "./types";
import { VERSAO_DRE } from "./types";
import { valorOuNulo } from "@/core/indicadores";
import {
  movimentosNoPeriodo,
  dreGerencial,
  dreFinanceiro,
  drePorLinha,
  drePorCliente,
  drePorCentroCusto,
  dreComparativo,
  dreProjetado,
} from "./engine";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Presets de período a partir de "hoje". */
export function periodoPreset(hoje: string, preset: "mes" | "mes_anterior" | "ytd" | "12m"): DREFiltro {
  const d = new Date(hoje + "T00:00:00"); // local: evita mês anterior em UTC-3 no 1º dia
  const ate = hoje;
  if (preset === "mes") {
    const de = `${hoje.slice(0, 7)}-01`;
    return { regime: "competencia", de, ate, periodoLabel: "Mês atual" };
  }
  if (preset === "mes_anterior") {
    const p = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const de = `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, "0")}-01`;
    const fim = new Date(d.getFullYear(), d.getMonth(), 0).toISOString().slice(0, 10);
    return { regime: "competencia", de, ate: fim, periodoLabel: "Mês anterior" };
  }
  if (preset === "ytd") {
    return { regime: "competencia", de: `${d.getFullYear()}-01-01`, ate, periodoLabel: "YTD" };
  }
  const c = new Date(d.getFullYear(), d.getMonth() - 11, 1).toISOString().slice(0, 10);
  return { regime: "competencia", de: c, ate, periodoLabel: "12 meses" };
}

function montarExecutivo(
  g: DREGerencial,
  f: DREFinanceiro,
  caixa: number,
  scoreSaude: number,
  comp: ReturnType<typeof dreComparativo>,
  clientes: DREClienteLinha[],
): DREExecutivo {
  const problemas: string[] = [];
  const oportunidades: string[] = [];

  /*
   * ⚠️ A margem só entra na leitura quando EXISTE. Sem receita líquida no
   * período não há margem — e a frase "Margem EBITDA comprimida (0%)" afirmaria
   * que a operação vendeu e não sobrou nada, quando a verdade é que não vendeu.
   * As duas mandam fazer coisas opostas: cortar custo × vender.
   */
  const mEbitda = valorOuNulo(g.margemEbitda);
  if (g.ebitda < 0) problemas.push("EBITDA negativo no período");
  else if (mEbitda !== null && mEbitda < 0.1) problemas.push(`Margem EBITDA comprimida (${pct(mEbitda)})`);
  const topCliente = clientes[0];
  if (topCliente && topCliente.share > 0.3) problemas.push(`Concentração: ${topCliente.cliente} = ${pct(topCliente.share)} da receita`);
  const inad = clientes.reduce((s, c) => s + c.inadimplencia, 0);
  if (inad > 0) problemas.push(`Inadimplência em aberto de ${fmt(inad)}`);
  if (f.runwayMeses < 6) problemas.push(`Runway curto (${f.runwayMeses} meses)`);
  if (comp.variacaoReceita < -0.05) problemas.push(`Receita caiu ${pct(Math.abs(comp.variacaoReceita))} vs mês anterior`);

  if (comp.variacaoReceita > 0.05) oportunidades.push(`Receita cresceu ${pct(comp.variacaoReceita)} vs mês anterior`);
  if (mEbitda !== null && mEbitda > 0.2) oportunidades.push(`Margem EBITDA saudável (${pct(mEbitda)})`);
  const maisRentavel = [...clientes].sort((a, b) => b.margem - a.margem)[0];
  if (maisRentavel && maisRentavel.margem > 0.3) oportunidades.push(`${maisRentavel.cliente} é cliente de alta margem (${pct(maisRentavel.margem)})`);
  if (f.fluxoLivre > 0) oportunidades.push("Fluxo de caixa livre positivo — espaço para reinvestir");

  const tendencia = comp.variacaoEbitda > 0.05 ? "em alta" : comp.variacaoEbitda < -0.05 ? "em queda" : "estável";
  const comentario =
    `Resultado do período: receita líquida de ${fmt(g.receitaLiquida)}, EBITDA de ${fmt(g.ebitda)}${mEbitda !== null ? ` (margem ${pct(mEbitda)})` : " (sem receita no período, não há margem a calcular)"} e lucro líquido de ${fmt(g.lucroLiquido)}. ` +
    `O EBITDA está ${tendencia} frente ao mês anterior. ` +
    (problemas[0] ? `Atenção: ${problemas[0].toLowerCase()}. ` : "") +
    (topCliente ? `Maior receita: ${topCliente.cliente} (${pct(topCliente.share)}).` : "");

  return {
    receita: g.receitaBruta,
    ebitda: g.ebitda,
    margemEbitda: mEbitda,
    lucroLiquido: g.lucroLiquido,
    burnMensal: f.burnMensal,
    runwayMeses: f.runwayMeses,
    caixa,
    risco: scoreSaude,
    problemas: problemas.slice(0, 5),
    oportunidades: oportunidades.slice(0, 5),
    comentario,
  };
}

export function financialDRE(input: RiskInput, filtro?: DREFiltro): DREReport {
  const f = filtro ?? periodoPreset(input.hoje, "12m");
  const movs = movimentosNoPeriodo(input, f.regime, f.de, f.ate);

  const gerencial = dreGerencial(movs, f.regime);
  const financeiro = dreFinanceiro(input, f.de, f.ate);
  const comparativo = dreComparativo(input, f.regime);
  const porCliente = drePorCliente(input, movs);
  const porLinha = drePorLinha(movs);
  const porCentroCusto = drePorCentroCusto(movs);
  // Sem margem apurada não há o que projetar: a projeção herda a ausência em
  // vez de virar zero, que projetaria "vai continuar sem sobrar nada".
  const projetado = dreProjetado(input, valorOuNulo(gerencial.margemEbitda) ?? 0, valorOuNulo(gerencial.margemLiquida) ?? 0);
  const scoreSaude = analisarQuantitativo(input).score.score;
  const executivo = montarExecutivo(gerencial, financeiro, input.saldoAtual, scoreSaude, comparativo, porCliente);

  return {
    filtro: f,
    gerencial,
    financeiro,
    comparativo,
    porCliente,
    porLinha,
    porCentroCusto,
    projetado,
    executivo,
    versaoModelo: VERSAO_DRE,
  };
}

export type { DREReport, DREFiltro, Regime } from "./types";
export { financialDRE as default };
