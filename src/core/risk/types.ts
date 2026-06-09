/**
 * all4pay — Risk Intelligence Layer (motor de inadimplência / crédito)
 * --------------------------------------------------------------------
 * Núcleo proprietário de credit intelligence: prever inadimplência
 * ANTES de acontecer, a partir do comportamento financeiro dinâmico
 * (não de status estático). Camadas: Comportamento → Features →
 * Normalização → Scoring → Probabilística → Explicabilidade →
 * Early Warning → Recuperação → Recomendação de crédito → Segmentação.
 *
 * Puro, tipado, auditável. Valores em REAIS (number), pt-BR.
 * Consome o mesmo RiskInput do motor de risco de caixa (movements +
 * partyNames), então roda idêntico sobre demo e live.
 */

export type ClassificacaoRisco = "baixo" | "moderado" | "alto" | "critico";

export type SegmentoCliente =
  | "bom_pagador"
  | "sazonal"
  | "deteriorando"
  | "inadimplente_cronico"
  | "novo";

/** Um recebível do cliente, com o atraso já calculado. */
export interface PagamentoEvento {
  id: string;
  due_date: string; // ISO
  paid_date?: string | null;
  status: "pendente" | "pago" | "cancelado";
  valor: number;
  /** Dias de atraso (assinado p/ pagos: <0 = antecipado). */
  diasAtraso: number;
  vencido: boolean; // pendente e já vencido
  emAberto: boolean; // pendente (a receber)
}

/** Sinais comportamentais extraídos do histórico do cliente. */
export interface ClienteFeatures {
  clienteId: string;
  nome: string;
  totalPagamentos: number;
  pagos: number;
  // ---- atraso ----
  diasAtrasoMedio: number;
  diasAtrasoMaximo: number;
  atrasoRecente: number; // média de atraso nos últimos 90 dias
  recorrenciaAtraso: number; // 0..1 (pagamentos com atraso / avaliáveis)
  oscilacaoPagamento: number; // desvio-padrão dos dias de pagamento
  // ---- volume / ticket ----
  ticketMedio: number;
  variacaoTicket: number; // (-) = queda recente de ticket
  tendenciaRecente: number; // 0..1 (deterioração recente do atraso)
  faturamentoPeriodo: number;
  concentracao: number; // 0..1 (share da receita total da carteira)
  // ---- exposição ----
  volumeAberto: number; // R$ a receber em aberto
  volumeVencido: number; // R$ já vencido
  sazonalidade: number; // 0..1 (variação sazonal do atraso)
}

/** Fator que contribuiu para o score — explicável e auditável. */
export interface FatorExplicado {
  fator: string;
  contribuicao: number; // pontos no score (0..100)
  detalhe: string;
}

export interface EarlyWarning {
  ativo: boolean;
  severidade: "baixa" | "media" | "alta";
  sinais: string[];
}

export interface RecoveryPrediction {
  chanceRecuperacao: number; // 0..1
  detalhe: string;
}

export type AcaoCredito =
  | "manter"
  | "monitorar"
  | "antecipar_cobranca"
  | "reduzir_prazo"
  | "exigir_entrada"
  | "suspender";

export type EstrategiaCobranca = "amigavel" | "proativa" | "agressiva_precoce";

/** Recomendação de crédito / cobrança adaptativa (AI Collections). */
export interface CreditRecommendation {
  acao: AcaoCredito;
  limiteSugerido: number; // R$ (dynamic credit limit)
  prazoSugeridoDias: number;
  entradaSugeridaPct: number; // 0..1
  estrategiaCobranca: EstrategiaCobranca;
  resumo: string;
}

/** Perfil de risco completo de um cliente. */
export interface CustomerRiskProfile {
  clienteId: string;
  nome: string;
  score: number; // 0..100 (risco; 100 = pior)
  probabilidadeInadimplencia: number; // 0..1
  classificacao: ClassificacaoRisco;
  segmento: SegmentoCliente;
  features: ClienteFeatures;
  fatoresRisco: FatorExplicado[];
  recomendacoes: string[];
  earlyWarning: EarlyWarning;
  recovery: RecoveryPrediction;
  credito: CreditRecommendation;
}

export interface SegmentoResumo {
  segmento: SegmentoCliente;
  label: string;
  clientes: number;
  exposicao: number;
}

/** Diagnóstico da carteira inteira. */
export interface InadimplenciaPortfolio {
  hoje: string;
  clientes: CustomerRiskProfile[]; // ordenados por score desc
  resumo: {
    totalClientes: number;
    exposicaoTotal: number; // R$ em aberto
    exposicaoVencida: number; // R$ já vencido
    inadimplenciaEsperada: number; // R$ esperado de perda (Σ aberto·prob)
    clientesCriticos: number;
    clientesAlto: number;
    scoreCarteira: number; // 0..100 ponderado por exposição
  };
  segmentos: SegmentoResumo[];
  versaoModelo: string;
}

export const VERSAO_MODELO_CREDITO = "risco-credito/1.0.0";

export const CLASSIF_LABEL: Record<ClassificacaoRisco, string> = {
  baixo: "Risco baixo",
  moderado: "Risco moderado",
  alto: "Risco alto",
  critico: "Risco crítico",
};

export const SEGMENTO_LABEL: Record<SegmentoCliente, string> = {
  bom_pagador: "Bons pagadores",
  sazonal: "Pagadores sazonais",
  deteriorando: "Em deterioração",
  inadimplente_cronico: "Inadimplentes crônicos",
  novo: "Histórico curto",
};
