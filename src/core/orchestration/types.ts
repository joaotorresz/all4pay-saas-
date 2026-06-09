/**
 * all4pay — Financial Orchestration Layer (o "cérebro operacional")
 * ----------------------------------------------------------------
 * GAP 1: deixar de ser "vários módulos independentes" e virar uma
 * Financial Operating System orientada a eventos. Toda ação vira um
 * evento financeiro que propaga pela cascata:
 *
 *   ação → evento → Event Store → Ledger → State Engine (caixa,
 *   liquidez, risco, projeção, score) → Decisão/IA → Auditoria →
 *   Antifraude → Webhook.
 *
 * Event sourcing (history imutável, hash-chain), ledger de dupla
 * partida e um grafo financeiro unificado. Puro, tipado, demo-safe.
 */

/** Eventos financeiros canônicos do barramento. */
export type EventoTipo =
  | "PIX_RECEBIDO"
  | "BOLETO_EMITIDO"
  | "BOLETO_VENCIDO"
  | "PAGAMENTO_APROVADO"
  | "PAGAMENTO_EXECUTADO"
  | "SALDO_NEGATIVO"
  | "RISCO_ALTERADO"
  | "LIMITE_REDUZIDO"
  | "APROVACAO_CONCLUIDA";

export type Prioridade = "baixa" | "media" | "alta" | "critica";

/** Evento de entrada (antes de selar na cadeia). */
export interface EventoEntrada {
  tipo: EventoTipo;
  entidadeId: string;
  valor?: number;
  contraparte?: string;
  prioridade?: Prioridade;
  payload?: Record<string, unknown>;
  timestamp?: string;
}

/** Evento selado no Event Store (imutável, encadeado por hash). */
export interface EventoArmazenado {
  id: string;
  seq: number;
  tipo: EventoTipo;
  entidadeId: string;
  valor: number;
  contraparte?: string;
  prioridade: Prioridade;
  payload: Record<string, unknown>;
  timestamp: string;
  previousHash: string;
  hash: string;
}

export interface IntegridadeEventStore {
  intacta: boolean;
  total: number;
  problema?: { seq: number; motivo: string };
}

/* ---- Ledger de dupla partida (real-time) ---- */
export interface LancamentoLedger {
  id: string;
  seq: number;
  contaDebito: string;
  contaCredito: string;
  valor: number;
  tipo: EventoTipo;
  status: "confirmado" | "pendente";
  timestamp: string;
  hash: string;
}

export interface SaldoConta {
  conta: string;
  saldo: number;
}

/* ---- Estado financeiro consolidado ---- */
export interface FinancialState {
  saldoConsolidado: number;
  runwayDias: number;
  riscoScore: number; // 0..100 (saúde de risco de caixa)
  probRuptura: number; // 0..1
  inadimplenciaRatio: number; // 0..1
  overdueAmount: number;
  concentracaoTop: number; // 0..1
  burnMensal: number;
}

/** Delta entre dois estados (para mostrar a propagação). */
export interface StateDelta {
  campo: string;
  label: string;
  antes: number;
  depois: number;
  delta: number;
  formato: "moeda" | "pct" | "dias" | "score";
}

/* ---- Passo da orquestração (microprocesso da cascata) ---- */
export interface PassoOrquestracao {
  ordem: number;
  modulo: string;
  detalhe: string;
  status: "ok" | "alerta" | "critico";
}

export interface Reacao {
  tipo: "decisao" | "antifraude" | "alerta" | "webhook";
  severidade: Prioridade;
  texto: string;
}

export interface ResultadoOrquestracao {
  evento: EventoArmazenado;
  passos: PassoOrquestracao[];
  deltas: StateDelta[];
  reacoes: Reacao[];
  lancamentos: LancamentoLedger[];
  stateAntes: FinancialState;
  stateDepois: FinancialState;
}

/* ---- Grafo financeiro unificado ---- */
export interface GraphNode {
  id: string;
  tipo: "empresa" | "conta" | "cliente" | "fornecedor" | "categoria";
  label: string;
  valor: number; // peso (R$ fluído pelo nó)
  metrica?: string; // métrica anexa (ex.: risco, share)
}

export interface GraphEdge {
  de: string;
  para: string;
  valor: number;
  tipo: "recebimento" | "pagamento";
}

export interface FinancialGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  resumo: {
    contas: number;
    clientes: number;
    fornecedores: number;
    concentracaoTop: { nome: string; share: number } | null;
    fluxoTotal: number;
  };
}

export const VERSAO_ORQUESTRACAO = "orchestration/1.0.0";

let _seq = 0;
export const uid = (p: string) => `${p}_${(_seq++).toString(36)}`;

export const EVENTO_LABEL: Record<EventoTipo, string> = {
  PIX_RECEBIDO: "PIX recebido",
  BOLETO_EMITIDO: "Boleto emitido",
  BOLETO_VENCIDO: "Boleto vencido",
  PAGAMENTO_APROVADO: "Pagamento aprovado",
  PAGAMENTO_EXECUTADO: "Pagamento executado",
  SALDO_NEGATIVO: "Saldo negativo",
  RISCO_ALTERADO: "Risco alterado",
  LIMITE_REDUZIDO: "Limite reduzido",
  APROVACAO_CONCLUIDA: "Aprovação concluída",
};
