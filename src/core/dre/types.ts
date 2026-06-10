/**
 * all4pay — DRE Intelligence Center
 * ---------------------------------
 * Não é "um DRE": é um centro de resultado empresarial. Consome o mesmo
 * RiskInput (movements + categorias + contrapartes) e responde "quanto
 * ganhei, por quê, onde, qual cliente/linha, qual tendência, qual
 * projeção". Puro, tipado, demo-safe.
 *
 * Variações: Gerencial · Financeiro (caixa) · por Cliente · por Linha
 * (produto/unidade) · Comparativo · Projetado · Executivo (+ comentário).
 */

export type Regime = "competencia" | "caixa";

/** Uma linha do DRE gerencial (com drill-down opcional por categoria). */
export interface DRELinha {
  id: string;
  label: string;
  valor: number;
  pctReceita: number; // 0..1 (sobre a receita líquida)
  papel: "receita" | "deducao" | "subtotal" | "resultado";
  componentes?: { label: string; valor: number }[];
}

export interface DREGerencial {
  linhas: DRELinha[];
  receitaBruta: number;
  receitaLiquida: number;
  lucroBruto: number;
  ebitda: number;
  ebit: number;
  lair: number;
  lucroLiquido: number;
  margemBruta: number;
  margemEbitda: number;
  margemLiquida: number;
}

export interface DREFinanceiro {
  recebimentos: number;
  pagamentos: number;
  fluxoOperacional: number;
  fluxoFinanceiro: number;
  fluxoInvestimento: number;
  fluxoLivre: number;
  burnMensal: number;
  runwayMeses: number;
}

export interface DREClienteLinha {
  cliente: string;
  receita: number;
  share: number; // 0..1
  resultado: number; // receita - custo alocado
  margem: number; // 0..1
  inadimplencia: number; // R$ vencido
  risco: number; // 0..100 (score de crédito)
}

export interface DRELinhaReceita {
  linha: string;
  receita: number;
  custoAlocado: number;
  resultado: number;
  margem: number; // 0..1
}

export interface DREPeriodo {
  label: string;
  receita: number;
  ebitda: number;
  lucro: number;
  margemEbitda: number;
}

export interface DREComparativo {
  periodos: DREPeriodo[]; // mês atual, anterior, YTD, 12m
  variacaoReceita: number; // atual vs anterior (-1..+)
  variacaoEbitda: number;
}

export interface DREProjecao {
  horizonte: string; // "30 dias", "90 dias"...
  receita: number;
  ebitda: number;
  lucro: number;
}

export interface DREExecutivo {
  receita: number;
  ebitda: number;
  margemEbitda: number;
  lucroLiquido: number;
  burnMensal: number;
  runwayMeses: number;
  caixa: number;
  risco: number; // 0..100 score de saúde
  problemas: string[];
  oportunidades: string[];
  comentario: string; // copiloto
}

export interface DREFiltro {
  regime: Regime;
  de: string; // ISO
  ate: string; // ISO
  periodoLabel: string;
}

export interface DREReport {
  filtro: DREFiltro;
  gerencial: DREGerencial;
  financeiro: DREFinanceiro;
  comparativo: DREComparativo;
  porCliente: DREClienteLinha[];
  porLinha: DRELinhaReceita[];
  projetado: DREProjecao[];
  executivo: DREExecutivo;
  versaoModelo: string;
}

export const VERSAO_DRE = "dre/1.0.0";

let _seq = 0;
export const uid = (p: string) => `${p}_${(_seq++).toString(36)}`;
