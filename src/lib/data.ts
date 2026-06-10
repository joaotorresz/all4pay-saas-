/**
 * Data access for the financial overview widgets.
 *
 * Each function returns the already-aggregated shape a widget needs.
 * In demo mode it aggregates the deterministic seed; otherwise it queries
 * Supabase and runs the SAME aggregation functions. No mocked data ever
 * reaches a non-demo (production) render.
 */
import { createClient } from "@/lib/supabase/client";
import { isDemo } from "@/lib/demo";
import {
  DEMO_ACCOUNTS,
  DEMO_MOVEMENTS,
  DEMO_CATEGORIES,
  DEMO_COST_CENTERS,
  DEMO_PARTIES,
} from "@/lib/demo/seed";
import {
  summarizeReceivables,
  summarizePayables,
  summarizeAccounts,
  dailyCashflow,
  monthlySales,
  isoDay,
} from "@/lib/aggregations";
import type {
  Movement,
  MovementType,
  ReceivablesSummary,
  PayablesSummary,
  AccountsSummary,
  DailyCashflowPoint,
  MonthlySalesPoint,
  Category,
  CategoryKind,
  CostCenter,
  Party,
  FinancialAccount,
  LancamentoInput,
} from "@/lib/types";
import type { RiskInput } from "@/core/risk-engine/types";

/** Brief delay so per-widget skeletons are perceptible in demo mode. */
const demoDelay = () => new Promise((r) => setTimeout(r, 550));

const MOVEMENT_COLS =
  "id,account_id,type,status,category,amount,due_date,paid_date,reconciled,description";

export async function getReceivables(): Promise<ReceivablesSummary> {
  if (isDemo) {
    await demoDelay();
    return summarizeReceivables(DEMO_MOVEMENTS);
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("movements")
    .select(MOVEMENT_COLS)
    .eq("type", "entrada")
    .eq("status", "pendente");
  if (error) throw error;
  return summarizeReceivables((data ?? []) as Movement[]);
}

export async function getPayables(): Promise<PayablesSummary> {
  if (isDemo) {
    await demoDelay();
    return summarizePayables(DEMO_MOVEMENTS);
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("movements")
    .select(MOVEMENT_COLS)
    .eq("type", "saida")
    .eq("status", "pendente");
  if (error) throw error;
  return summarizePayables((data ?? []) as Movement[]);
}

export async function getAccounts(): Promise<AccountsSummary> {
  if (isDemo) {
    await demoDelay();
    return summarizeAccounts(DEMO_ACCOUNTS, DEMO_MOVEMENTS);
  }
  const supabase = createClient();
  const [accountsRes, unreconciledRes] = await Promise.all([
    supabase.from("financial_accounts").select("*").order("balance", { ascending: false }),
    supabase.from("movements").select("account_id,reconciled").eq("reconciled", false),
  ]);
  if (accountsRes.error) throw accountsRes.error;
  if (unreconciledRes.error) throw unreconciledRes.error;
  const pseudoMovements = (unreconciledRes.data ?? []).map((r) => ({
    account_id: (r as { account_id: string }).account_id,
    reconciled: false,
  })) as Movement[];
  return summarizeAccounts(accountsRes.data ?? [], pseudoMovements);
}

export async function getDailyCashflow(
  days = 14,
): Promise<DailyCashflowPoint[]> {
  if (isDemo) {
    await demoDelay();
    return dailyCashflow(DEMO_MOVEMENTS, days);
  }
  const supabase = createClient();
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  const { data, error } = await supabase
    .from("movements")
    .select("type,amount,due_date,paid_date,status")
    .eq("status", "pago")
    .gte("paid_date", isoDay(start));
  if (error) throw error;
  return dailyCashflow((data ?? []) as Movement[], days);
}

/** Open items of a direction, ordered by due date — for the drill-down list. */
export async function getOpenMovements(
  type: MovementType,
): Promise<Movement[]> {
  if (isDemo) {
    await demoDelay();
    return DEMO_MOVEMENTS.filter(
      (m) => m.type === type && m.status === "pendente",
    ).sort((a, b) => a.due_date.localeCompare(b.due_date));
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("movements")
    .select(MOVEMENT_COLS)
    .eq("type", type)
    .eq("status", "pendente")
    .order("due_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Movement[];
}

/** Unreconciled movements, optionally scoped to one account. */
export async function getUnreconciledMovements(
  accountId?: string,
): Promise<Movement[]> {
  if (isDemo) {
    await demoDelay();
    return DEMO_MOVEMENTS.filter(
      (m) => !m.reconciled && (!accountId || m.account_id === accountId),
    ).sort((a, b) => b.due_date.localeCompare(a.due_date));
  }
  const supabase = createClient();
  let query = supabase
    .from("movements")
    .select(MOVEMENT_COLS)
    .eq("reconciled", false)
    .order("due_date", { ascending: false });
  if (accountId) query = query.eq("account_id", accountId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Movement[];
}

/* ---- Cadastros (selects for the lançamento forms) ---- */

export async function getCategories(kind: CategoryKind): Promise<Category[]> {
  if (isDemo) return DEMO_CATEGORIES.filter((c) => c.kind === kind);
  const supabase = createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id,kind,name")
    .eq("kind", kind)
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return (data ?? []) as Category[];
}

export async function getCostCenters(): Promise<CostCenter[]> {
  if (isDemo) return DEMO_COST_CENTERS;
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cost_centers")
    .select("id,name")
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return (data ?? []) as CostCenter[];
}

type PartyRole = "customer" | "supplier" | "carrier";

export async function getParties(role: PartyRole): Promise<Party[]> {
  const col = `is_${role}` as const;
  if (isDemo)
    return DEMO_PARTIES.filter(
      (p) => (p as unknown as Record<string, unknown>)[col],
    );
  const supabase = createClient();
  const { data, error } = await supabase
    .from("parties")
    .select("id,type,name,doc,is_customer,is_supplier,is_carrier")
    .eq(col, true)
    .order("name");
  if (error) throw error;
  return (data ?? []) as Party[];
}

/** Lightweight account list for selects (id + name). */
export async function getAccountsList(): Promise<FinancialAccount[]> {
  if (isDemo) return DEMO_ACCOUNTS;
  const supabase = createClient();
  const { data, error } = await supabase
    .from("financial_accounts")
    .select("id,name,bank,balance")
    .order("name");
  if (error) throw error;
  return (data ?? []) as FinancialAccount[];
}

/** Build the movement rows for a lançamento (handles parcelamento). */
function buildMovementRows(input: LancamentoInput, groupId: string) {
  const type: MovementType = input.kind === "receita" ? "entrada" : "saida";
  const n = Math.max(1, input.installments);
  const per = Math.round((input.amount / n) * 100) / 100;
  const base = new Date(input.due_date);
  return Array.from({ length: n }, (_, i) => {
    const due = new Date(base);
    due.setMonth(base.getMonth() + i);
    const settledNow = input.settled && i === 0;
    return {
      account_id: input.account_id,
      type,
      status: settledNow ? "pago" : "pendente",
      category: null,
      category_id: input.category_id,
      cost_center_id: input.cost_center_id,
      party_id: input.party_id,
      amount: per,
      due_date: isoDay(due),
      paid_date: settledNow ? isoDay(new Date()) : null,
      reconciled: false,
      description: input.description,
      competence_date: input.competence_date,
      payment_method: input.payment_method,
      reference_code: input.reference_code,
      nsu: input.nsu,
      group_id: groupId,
      installment_no: n > 1 ? i + 1 : null,
      installment_total: n > 1 ? n : null,
    };
  });
}

/** Create a lançamento (Receita/Despesa) — movements (+ splits, recurrence). */
export async function createLancamento(input: LancamentoInput): Promise<void> {
  const groupId =
    globalThis.crypto?.randomUUID?.() ?? `grp-${Date.now()}`;

  if (isDemo) {
    await demoDelay();
    return; // demo: no write, the form just confirms success
  }

  const supabase = createClient();
  const rows = buildMovementRows(input, groupId);
  const { data: inserted, error } = await supabase
    .from("movements")
    .insert(rows)
    .select("id");
  if (error) throw error;

  const firstId = inserted?.[0]?.id;
  if (input.splits?.length && firstId) {
    const { error: se } = await supabase.from("movement_splits").insert(
      input.splits.map((s) => ({
        movement_id: firstId,
        category_id: s.category_id,
        cost_center_id: s.cost_center_id,
        percent: s.percent,
      })),
    );
    if (se) throw se;
  }

  if (input.repeat) {
    const { error: re } = await supabase.from("recurrences").insert({
      party_id: input.party_id,
      type: input.kind === "receita" ? "entrada" : "saida",
      description: input.description,
      amount: input.amount,
      freq: input.repeat.freq,
      start_date: input.due_date,
      end_date: input.repeat.until,
      category_id: input.category_id,
      cost_center_id: input.cost_center_id,
      due_day: new Date(input.due_date).getDate(),
    });
    if (re) throw re;
  }
}

/** Input for the cash-risk engine (scoreRiscoCaixa). */
/** Demo: deriva um centro de custo plausível a partir da categoria. */
function demoCostCenter(cat: string | null): string {
  const c = (cat ?? "").toLowerCase();
  if (/venda|outros/.test(c)) return "Comercial";
  if (/fornecedor/.test(c)) return "Operações";
  if (/folha/.test(c)) return "Administrativo";
  if (/imposto|tarifa|financ/.test(c)) return "Financeiro";
  return "Administrativo";
}

export async function getRiscoInput(): Promise<RiskInput> {
  const hoje = isoDay(new Date());
  if (isDemo) {
    const saldoAtual = DEMO_ACCOUNTS.reduce((s, a) => s + a.balance, 0);
    const movements = DEMO_MOVEMENTS.map((m) => ({
      id: m.id,
      type: m.type,
      status: m.status,
      amount: m.amount,
      due_date: m.due_date,
      paid_date: m.paid_date,
      // seed movements use the description as the counterparty label
      party_id: m.description ?? null,
      category: m.category,
      costCenter: demoCostCenter(m.category),
    }));
    const partyNames: Record<string, string> = {};
    movements.forEach((m) => {
      if (m.party_id) partyNames[m.party_id] = m.party_id;
    });
    return { hoje, saldoAtual, movements, partyNames, horizonDias: 60 };
  }

  const supabase = createClient();
  const [accRes, movRes, partyRes] = await Promise.all([
    supabase.from("financial_accounts").select("balance"),
    supabase
      .from("movements")
      .select(
        "id,type,status,amount,due_date,paid_date,party_id,category,categoria:category_id(name),centro:cost_center_id(name)",
      ),
    supabase.from("parties").select("id,name"),
  ]);
  if (accRes.error) throw accRes.error;
  if (movRes.error) throw movRes.error;
  const saldoAtual = (accRes.data ?? []).reduce(
    (s, a) => s + Number((a as { balance: number }).balance),
    0,
  );
  const embedName = (e: unknown): string | null =>
    Array.isArray(e) ? (e[0]?.name ?? null) : ((e as { name?: string } | null)?.name ?? null);
  const movements = ((movRes.data ?? []) as (Movement & { categoria?: unknown; centro?: unknown })[]).map((m) => ({
    id: m.id,
    type: m.type,
    status: m.status,
    amount: m.amount,
    due_date: m.due_date,
    paid_date: m.paid_date,
    party_id: m.party_id ?? null,
    // categoria real (nome do cadastro) tem prioridade sobre o texto livre
    category: embedName(m.categoria) ?? m.category,
    costCenter: embedName(m.centro),
  }));
  const partyNames: Record<string, string> = {};
  (partyRes.data ?? []).forEach((p) => {
    const row = p as { id: string; name: string };
    partyNames[row.id] = row.name;
  });
  return { hoje, saldoAtual, movements, partyNames, horizonDias: 60 };
}

export async function getSales(months = 12): Promise<MonthlySalesPoint[]> {
  if (isDemo) {
    await demoDelay();
    return monthlySales(DEMO_MOVEMENTS, months);
  }
  const supabase = createClient();
  const start = new Date();
  start.setMonth(start.getMonth() - (months - 1), 1);
  const { data, error } = await supabase
    .from("movements")
    .select("type,category,amount,due_date")
    .eq("type", "entrada")
    .gte("due_date", isoDay(start));
  if (error) throw error;
  return monthlySales((data ?? []) as Movement[], months);
}
