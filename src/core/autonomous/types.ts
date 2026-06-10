/**
 * all4pay — Autonomous Decision Layer (GAP 8)
 * -------------------------------------------
 * O salto de "informar o problema" para DECIDIR e executar (supervisionado).
 * Motor central de decisão operacional: transforma eventos/scores/risco em
 * FinancialDecision[] com confiança, explicabilidade e guardrails
 * (human-in-the-loop). Reúne os motores decisão/crédito/tesouraria.
 * Puro, explicável, demo-safe.
 */

export type TipoDecisao = "cobranca" | "pagamento" | "capital" | "risco";
export type ModoExecucao = "automatico" | "requer_aprovacao";

/** Decisão financeira estruturada (não texto solto). */
export interface FinancialDecision {
  id: string;
  tipo: TipoDecisao;
  titulo: string;
  recomendacao: string;
  prioridade: number; // 1 = mais urgente
  impactoEsperado: number; // R$ (0 quando não monetizável diretamente)
  confianca: number; // 0..1
  fatores: string[]; // explicabilidade
  riscoExecucao: number; // 0..1
  modo: ModoExecucao;
  valor: number; // valor envolvido (dirige o human-in-the-loop)
  origem: string; // política/motor que gerou
}

/** Política low-code: SE <condição> ENTÃO <ação>. */
export interface PoliticaAutonoma {
  id: string;
  nome: string;
  se: string;
  entao: string;
  tipo: TipoDecisao;
  disparou: boolean;
  decisoes: number;
}

/** Cobrança autônoma — canal/horário/estratégia por cliente. */
export interface CollectionPlan {
  cliente: string;
  score: number;
  exposicao: number;
  canal: "whatsapp" | "email" | "ligacao";
  horario: string;
  estrategia: "amigavel" | "proativa" | "agressiva_precoce";
  tom: string;
}

/** Roteamento inteligente de pagamento. */
export interface PaymentRoute {
  valor: number;
  contaEscolhida: string;
  banco: string;
  motivo: string;
}

export interface NextBestAction {
  acao: string;
  tipo: TipoDecisao;
  impacto: string;
  confianca: number;
}

export interface HumanInTheLoop {
  limiteAutomatico: number; // R$ até onde executa sozinho
  confiancaMinima: number; // 0..1
  automaticas: number;
  pendentesAprovacao: number;
}

export interface AutonomousOpsReport {
  hoje: string;
  headline: string;
  decisoes: FinancialDecision[];
  nextBestAction: NextBestAction | null;
  politicas: PoliticaAutonoma[];
  collections: CollectionPlan[];
  routing: PaymentRoute[];
  hitl: HumanInTheLoop;
  versaoModelo: string;
}

export const VERSAO_AUTONOMOUS = "autonomous/1.0.0";

let _seq = 0;
export const uid = (p: string) => `${p}_${(_seq++).toString(36)}`;

export const TIPO_LABEL: Record<TipoDecisao, string> = {
  cobranca: "Cobrança",
  pagamento: "Pagamento",
  capital: "Capital",
  risco: "Risco",
};
