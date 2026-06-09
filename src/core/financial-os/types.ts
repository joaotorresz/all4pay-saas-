/**
 * all4pay — Financial OS Layer
 * ----------------------------------------------------------------
 * Tipos do sistema operacional financeiro (orientado a eventos):
 * Reconciliation · Event Bus · Rules · Automation · Notification ·
 * Workflow · Audit · AI Interpretation · Integration Gateway.
 *
 * Tudo in-process/in-memory (arquitetura inicial correta). Em escala,
 * o transporte de eventos troca para Kafka/EventBridge/PubSub sem
 * alterar os contratos abaixo.
 */

export type FonteFinanceira =
  | "ofx"
  | "pix"
  | "boleto"
  | "cartao"
  | "ted"
  | "comprovante"
  | "nota_fiscal"
  | "api_bancaria"
  | "erp"
  | "email"
  | "manual";

/** Transação financeira normalizada — denominador comum de toda fonte. */
export interface FinancialTransaction {
  id: string;
  valor: number; // positivo; direção em `tipo`
  data: string; // ISO
  contraparte?: string;
  documento?: string;
  tipo: "entrada" | "saida";
  categoria?: string;
  origem: FonteFinanceira;
  hashFinanceiro: string;
  metadata: Record<string, unknown>;
}

/* ---- Reconciliação ---- */
export interface MatchBreakdown {
  valor: number;
  data: number;
  documento: number;
  contraparte: number;
  categoria: number;
}
export interface MatchResult {
  transacao: FinancialTransaction;
  ledger: FinancialTransaction | null;
  confidence: number; // 0..100
  breakdown: MatchBreakdown;
  decisao: "auto" | "sugestao" | "manual";
}
export interface ReconciliationResult {
  auto: MatchResult[];
  sugestoes: MatchResult[];
  excecoes: MatchResult[];
  total: number;
  taxaAuto: number; // 0..1
}

/** OCR de comprovante (interface; parser plugável a serviço real). */
export interface ComprovanteExtraido {
  banco: string;
  valor: number;
  dataHora: string;
  destinatario: string;
  autenticacao?: string;
}

/* ---- Event Bus ---- */
export type FinancialEventType =
  | "pagamento_criado"
  | "pagamento_recebido"
  | "saldo_critico"
  | "nota_emitida"
  | "cliente_inadimplente"
  | "imposto_proximo"
  | "transacao_reconciliada"
  | "anomalia_detectada"
  | "custo_variou";

export type Prioridade = "baixa" | "media" | "alta" | "critica";

export interface FinancialEvent {
  id: string;
  tipo: FinancialEventType;
  entidadeId: string;
  timestamp: string;
  payload: Record<string, unknown>;
  prioridade: Prioridade;
}

export type EventHandler = (e: FinancialEvent) => void;

/* ---- Rules Engine ---- */
export type Operador = ">" | "<" | "=" | ">=" | "<=" | "contains";
export interface Condition {
  campo: string;
  operador: Operador;
  valor: string | number;
}
export type ActionType =
  | "enviar_whatsapp"
  | "enviar_email"
  | "gerar_cobranca"
  | "bloquear_pagamento"
  | "marcar_risco"
  | "notificar_time"
  | "criar_tarefa"
  | "pedir_aprovacao_dupla";
export interface Action {
  tipo: ActionType;
  destino?: string;
}
export interface FinancialRule {
  id: string;
  nome: string;
  trigger: FinancialEventType;
  conditions: Condition[];
  actions: Action[];
  prioridade: Prioridade;
  ativo: boolean;
}
export interface RuleFire {
  rule: FinancialRule;
  event: FinancialEvent;
  actions: Action[];
}

/* ---- Automation / Notification ---- */
export interface ExecucaoAcao {
  id: string;
  ruleId: string;
  ruleNome: string;
  acao: ActionType;
  destino?: string;
  status: "executada" | "enfileirada" | "falha";
  timestamp: string;
  detalhe: string;
}

/* ---- Audit Trail ---- */
export interface AuditLog {
  id: string;
  usuario: string;
  acao: string;
  antes: unknown;
  depois: unknown;
  timestamp: string;
}

/* ---- AI Interpretation ---- */
export interface RuleSuggestion {
  titulo: string;
  descricao: string;
  rule: Omit<FinancialRule, "id" | "ativo">;
}

export const FINANCIAL_OS_VERSION = "financial-os/1.0.0";

/* ---- helpers ---- */
export const uid = (p = "id") =>
  `${p}-${(globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2))}`;
