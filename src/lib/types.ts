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
  /** Counterparty (cliente/fornecedor), when known. */
  party_id?: string | null;
  /** ISO date (YYYY-MM-DD). */
  due_date: string;
  paid_date: string | null;
  /** false => still needs reconciliation (drives the conciliação badge). */
  reconciled: boolean;
  description: string | null;
  created_at?: string;
  /** Marcador de origem (ex.: `rec:<id>:<data>` p/ faturas de recorrência). */
  reference_code?: string | null;
  /** Boleto colado ao recebível (movements.boleto jsonb). */
  boleto?: BoletoData | null;
}

export type BoletoStatus =
  | "gerado" | "registrado" | "emitido" | "pago" | "vencido" | "cancelado" | "conciliado";

export interface BoletoData {
  status: BoletoStatus;
  nosso_numero: string;
  linha_digitavel: string;
  codigo_barras: string;
  conta_recebimento?: string | null;
  multa?: number;
  juros?: number;
  desconto?: number;
  instrucoes?: string;
  emitido_em: string;
  paid_date?: string | null;
  /** PIX "copia e cola" (BR Code/EMV) do mesmo título — pagamento instantâneo. */
  pix_copia_cola?: string | null;
}

/* ---- Derived shapes returned by the widget hooks ---- */

export interface ReceivablesSummary {
  today: number; // realizado hoje (recebido/pago hoje)
  week: number; // a receber/pagar essa semana (pendente)
  month: number; // a receber/pagar esse mês (pendente)
  count: number; // itens pendentes em aberto
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
  projetado?: boolean; // dia futuro: fluxo PREVISTO (pendentes por vencimento)
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
  phone?: string | null;
  email?: string | null;
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
  /** Projeto (centro de resultado temporal). Vai para `movements.project_id`. */
  project_id?: string | null;
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

/* ---- Vendas/Compras + cadastros (migration 0003) ---- */

export type SaleDocKind = "venda" | "compra" | "orcamento";
export type ItemKind = "produto" | "servico";

export interface Brand {
  id: string;
  name: string;
}
export interface Unit {
  id: string;
  name: string;
  abbrev: string;
}
export interface Salesperson {
  id: string;
  name: string;
}
export interface Product {
  id: string;
  name: string;
  sku?: string | null;
  sale_price?: number;
}
export interface Service {
  id: string;
  name: string;
  price?: number;
}

/** Row shown in the Vendas listing. */
export interface SaleDocRow {
  id: string;
  kind: SaleDocKind;
  item_kind: ItemKind;
  party_name: string;
  doc_date: string;
  total: number;
  status: string;
}

export interface TransferenciaInput {
  from_account_id: string;
  to_account_id: string;
  date: string;
  amount: number;
  description: string | null;
}

export interface SaleItemInput {
  ref_id: string | null; // product_id or service_id
  description: string;
  qty: number;
  unit_price: number;
  discount: number;
}

export interface SaleDocInput {
  kind: SaleDocKind;
  item_kind: ItemKind;
  party_id: string | null;
  salesperson_id: string | null;
  cost_center_id: string | null;
  doc_date: string;
  validity: string | null; // orçamento
  discount: number; // desconto geral
  notes: string | null;
  items: SaleItemInput[];
  // condição de pagamento (não usada em orçamento)
  due_date: string | null;
  payment_method: PaymentMethod | null;
  installments?: number | null; // parcelas (crédito parcelado)
  account_id: string | null;
  settled: boolean;
}

export interface ContratoInput {
  party_id: string | null;
  type: MovementType; // receita/despesa => entrada/saida
  description: string;
  amount: number;
  freq: RecurrenceFreq;
  start_date: string;
  end_date: string | null;
  category_id: string | null;
  cost_center_id: string | null;
  due_day: number | null;
}

export interface PartyInput {
  type: PartyType;
  name: string;
  doc: string | null;
  email: string | null;
  phone: string | null;
  zip: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  is_customer: boolean;
  is_supplier: boolean;
  is_carrier: boolean;
  antt: string | null;
}

export interface ProductInput {
  name: string;
  sku: string | null;
  category_id: string | null;
  unit_id: string | null;
  brand_id: string | null;
  sale_price: number;
  cost_price: number | null;
  track_stock: boolean;
  stock_initial: number | null;
}

export interface ServiceInput {
  name: string;
  code: string | null;
  category_id: string | null;
  unit_id: string | null;
  price: number;
}

export interface BrandInput {
  name: string;
  description: string | null;
}
export interface UnitInput {
  name: string;
  abbrev: string;
}
