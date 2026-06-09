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
import { DEMO_ACCOUNTS, DEMO_MOVEMENTS } from "@/lib/demo/seed";
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
} from "@/lib/types";

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
    .eq("category", "venda")
    .gte("due_date", isoDay(start));
  if (error) throw error;
  return monthlySales((data ?? []) as Movement[], months);
}
