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

import type { Indicador } from "@/core/indicadores";

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
  /**
   * ⚠️ **As margens são `Indicador`, não `number`, e isso é o contrato.**
   *
   * O caminho antigo dividia por `receitaLiquida > 0 ? receitaLiquida : 1`.
   * Dividir por 1 não aproxima nada: apresenta o valor ABSOLUTO em reais com um
   * símbolo de porcentagem ao lado — um EBITDA de −R$ 30.000 virava
   * "−3.000.000%". É publicar uma mentira sabendo que é mentira, e mata a regra
   * "sem número, sem afirmação" justamente nas telas onde ela mais importa.
   *
   * Sem receita líquida não existe margem. `indisponivel` preenchido ⇒ a tela
   * mostra o motivo ou um traço; **nunca 0%, nunca número**.
   *
   * ⚠️ Não é caso hipotético: a organização auditada tem Custos Variáveis
   * zerados e meses sem movimento.
   */
  margemBruta: Indicador;
  margemEbitda: Indicador;
  margemLiquida: Indicador;
  /** O regime sob o qual ESTES números foram apurados. */
  regime: Regime;
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

export interface DRECentroCusto {
  centro: string;
  receita: number;
  despesa: number;
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
  /**
   * ⚠️ `null` quando não houve receita líquida no período. Não é 0: "margem de
   * 0%" lê como *vendeu e não sobrou nada*, e a verdade é *não vendeu*.
   */
  margemEbitda: number | null;
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
  /**
   * A linha DECLARADA de cada categoria (chave em minúsculas), vinda do plano
   * de contas.
   *
   * ⚠️ Existe aqui pelo mesmo motivo que existe em `FiltroRelatorio`: sem ela o
   * CARTÃO executivo e a TABELA do relatório davam números diferentes para a
   * mesma empresa. Medido na matriz cartão × tabela: R$ 25.000,00 de diferença
   * — o valor exato de uma transferência declarada que só uma das duas cascatas
   * reconhecia. O cartão publicava faturamento inflado por dinheiro que apenas
   * trocou de bolso.
   */
  linhaPorCategoria?: Record<string, string>;
}

export interface DREReport {
  filtro: DREFiltro;
  gerencial: DREGerencial;
  financeiro: DREFinanceiro;
  comparativo: DREComparativo;
  porCliente: DREClienteLinha[];
  porLinha: DRELinhaReceita[];
  porCentroCusto: DRECentroCusto[];
  projetado: DREProjecao[];
  executivo: DREExecutivo;
  versaoModelo: string;
}

export const VERSAO_DRE = "dre/1.0.0";

let _seq = 0;
export const uid = (p: string) => `${p}_${(_seq++).toString(36)}`;
