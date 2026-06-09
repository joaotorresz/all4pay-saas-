/**
 * Domain model for the all4pay financial overview.
 * Mirrors the Supabase schema in `supabase/migrations/` — keep in sync.
 */

export type MovementType = "entrada" | "saida";
export type MovementStatus = "pendente" | "pago" | "cancelado";

/** A bank/payment account the company holds money in. */
export interface FinancialAccount {
  id: string;
  name: string;
  /** Bank brand key (used to pick the brand dot color), e.g. "itau". */
  bank: string;
  /** Current consolidated balance, in BRL. */
  balance: number;
  created_at?: string;
}

/** A single cash movement (a receivable or a payable). */
export interface Movement {
  id: string;
  account_id: string;
  type: MovementType;
  status: MovementStatus;
  /** Free category; "venda" feeds the sales chart. */
  category: string | null;
  /** Positive magnitude in BRL; direction comes from `type`. */
  amount: number;
  /** ISO date (YYYY-MM-DD). */
  due_date: string;
  paid_date: string | null;
  /** false => still needs reconciliation (drives the conciliação badge). */
  reconciled: boolean;
  description: string | null;
  created_at?: string;
}

/* ---- Derived shapes returned by the widget hooks ---- */

export interface ReceivablesSummary {
  overdue: number; // total VENCIDO
  dueToday: number; // VENCE HOJE
  restOfMonth: number; // restante do mês
  count: number; // open items
}

export type PayablesSummary = ReceivablesSummary;

export interface AccountBalance extends FinancialAccount {
  /** Movements on this account still awaiting reconciliation. */
  pendingReconciliations: number;
}

export interface AccountsSummary {
  total: number;
  accounts: AccountBalance[];
}

export interface DailyCashflowPoint {
  date: string; // ISO day
  label: string; // "12/06"
  inflow: number; // entradas (>= 0)
  outflow: number; // saídas (<= 0, stored negative for the stacked bar)
  balance: number; // saldo acumulado até o dia
}

export interface MonthlySalesPoint {
  month: string; // "2025-07"
  label: string; // "jul"
  total: number;
}

/* ---- Lançamentos / cadastros (migration 0002) ---- */

export type CategoryKind = "receita" | "despesa";
export type PaymentMethod =
  | "pix"
  | "boleto"
  | "cartao"
  | "dinheiro"
  | "transferencia";
export type RecurrenceFreq = "semanal" | "mensal" | "anual";
export type PartyType = "pf" | "pj";

export interface Category {
  id: string;
  kind: CategoryKind;
  name: string;
}

export interface CostCenter {
  id: string;
  name: string;
}

export interface Party {
  id: string;
  type: PartyType;
  name: string;
  doc?: string | null;
  is_customer?: boolean;
  is_supplier?: boolean;
  is_carrier?: boolean;
}

/** A single rateio line. */
export interface SplitLine {
  category_id: string | null;
  cost_center_id: string | null;
  percent: number | null;
}

/** Payload the Receita/Despesa form submits. `kind` flips the mirror. */
export interface LancamentoInput {
  kind: CategoryKind;
  party_id: string | null;
  competence_date: string; // ISO
  description: string;
  amount: number;
  category_id: string | null;
  cost_center_id: string | null;
  reference_code: string | null;
  splits: SplitLine[] | null;
  repeat: {
    freq: RecurrenceFreq;
    count: number | null;
    until: string | null;
  } | null;
  installments: number; // 1 = à vista
  due_date: string; // ISO
  payment_method: PaymentMethod | null;
  account_id: string | null;
  settled: boolean; // recebido / pago
  nsu: string | null;
}
