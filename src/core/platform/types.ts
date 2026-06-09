/**
 * all4pay — Financial Infrastructure (GAP 3)
 * ------------------------------------------
 * A evolução de "produto" para "financial infrastructure company":
 * Domain Financial Architecture sobre um Double-Entry Ledger Core (a
 * verdade absoluta — saldo é estado DERIVADO do ledger, nunca soma de
 * queries), com idempotência, fila com retry, recuperação de estado e
 * observabilidade financeira. Puro, tipado, demo-safe.
 */

/* ---- Ledger de dupla partida ---- */
export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";
export type Direction = "debit" | "credit";

export interface Account {
  code: string;
  name: string;
  type: AccountType;
}

export interface Posting {
  accountCode: string;
  direction: Direction;
  amount: number;
}

export interface LedgerTransaction {
  id: string;
  seq: number;
  ref: string; // idempotency / origem
  descricao: string;
  timestamp: string;
  postings: Posting[];
  revertidaDe?: string;
}

export interface AccountBalance {
  code: string;
  name: string;
  type: AccountType;
  saldo: number; // derivado do ledger
}

export interface TrialBalance {
  totalDebito: number;
  totalCredito: number;
  balanceado: boolean; // invariante: débitos == créditos
}

/* ---- Idempotência ---- */
export interface IdempotencyRecord {
  key: string;
  resultadoRef: string;
  criadoEm: string;
}

/* ---- Fila financeira ---- */
export type JobStatus = "pendente" | "processando" | "concluido" | "falha" | "retentando";
export type MetodoPagamento = "pix" | "boleto" | "ted" | "cartao";

export interface QueueJob {
  id: string;
  idempotencyKey: string;
  metodo: MetodoPagamento;
  valor: number;
  contraparte?: string;
  status: JobStatus;
  tentativas: number;
  maxTentativas: number;
  proximoRetryMs?: number;
  ultimoErro?: string;
  criadoEm: string;
}

/* ---- Observabilidade financeira ---- */
export type SaudeNivel = "ok" | "degradado" | "critico";
export interface SinalObservabilidade {
  id: string;
  nome: string;
  status: SaudeNivel;
  detalhe: string;
}

/* ---- Arquitetura de domínios ---- */
export type DomainStatus = "ativo" | "parcial" | "planejado";
export interface FinancialDomain {
  id: string;
  nome: string;
  descricao: string;
  status: DomainStatus;
  modulo?: string; // rota/onde vive no produto
}

/* ---- Resultado do orquestrador de pagamentos ---- */
export interface ResultadoPagamento {
  idempotencyKey: string;
  duplicado: boolean;
  status: JobStatus;
  tentativas: number;
  transacaoId?: string;
  detalhe: string;
}

export const VERSAO_PLATFORM = "platform/1.0.0";

let _seq = 0;
export const uid = (p: string) => `${p}_${(_seq++).toString(36)}`;
