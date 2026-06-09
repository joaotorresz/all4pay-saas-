/**
 * Pure aggregation helpers — the single computation path used by BOTH
 * the demo seed and live Supabase rows. Given raw movements/accounts,
 * they derive the shapes each widget renders.
 */
import type {
  Movement,
  FinancialAccount,
  ReceivablesSummary,
  AccountsSummary,
  DailyCashflowPoint,
  MonthlySalesPoint,
} from "./types";

/** Local ISO day (YYYY-MM-DD), timezone-safe. */
export function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function endOfMonthISO(today: Date): string {
  return isoDay(new Date(today.getFullYear(), today.getMonth() + 1, 0));
}

/** Vencido / vence hoje / restante do mês, for one movement direction. */
function summarizeOpen(
  movements: Movement[],
  today: Date,
): ReceivablesSummary {
  const todayISO = isoDay(today);
  const eom = endOfMonthISO(today);
  let overdue = 0,
    dueToday = 0,
    restOfMonth = 0,
    count = 0;

  for (const m of movements) {
    if (m.status !== "pendente") continue;
    count++;
    if (m.due_date < todayISO) overdue += m.amount;
    else if (m.due_date === todayISO) dueToday += m.amount;
    else if (m.due_date <= eom) restOfMonth += m.amount;
  }
  return { overdue, dueToday, restOfMonth, count };
}

export function summarizeReceivables(
  movements: Movement[],
  today = new Date(),
): ReceivablesSummary {
  return summarizeOpen(
    movements.filter((m) => m.type === "entrada"),
    today,
  );
}

export function summarizePayables(
  movements: Movement[],
  today = new Date(),
): ReceivablesSummary {
  return summarizeOpen(
    movements.filter((m) => m.type === "saida"),
    today,
  );
}

export function summarizeAccounts(
  accounts: FinancialAccount[],
  movements: Movement[],
): AccountsSummary {
  const pendingByAccount = new Map<string, number>();
  for (const m of movements) {
    if (!m.reconciled) {
      pendingByAccount.set(
        m.account_id,
        (pendingByAccount.get(m.account_id) ?? 0) + 1,
      );
    }
  }
  const enriched = accounts.map((a) => ({
    ...a,
    pendingReconciliations: pendingByAccount.get(a.id) ?? 0,
  }));
  return {
    total: enriched.reduce((sum, a) => sum + a.balance, 0),
    accounts: enriched,
  };
}

const DAY_LABEL = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

/**
 * Daily cash flow over the last `days` (inclusive of today). Only settled
 * movements (status=pago, by paid_date) count toward realized flow.
 * `balance` is the running cumulative net within the window.
 */
export function dailyCashflow(
  movements: Movement[],
  days = 14,
  today = new Date(),
): DailyCashflowPoint[] {
  const buckets = new Map<string, { inflow: number; outflow: number }>();
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  const startISO = isoDay(start);
  const todayISO = isoDay(today);

  for (const m of movements) {
    const day = m.paid_date ?? (m.status === "pago" ? m.due_date : null);
    if (!day || day < startISO || day > todayISO) continue;
    const b = buckets.get(day) ?? { inflow: 0, outflow: 0 };
    if (m.type === "entrada") b.inflow += m.amount;
    else b.outflow += m.amount;
    buckets.set(day, b);
  }

  const points: DailyCashflowPoint[] = [];
  let running = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = isoDay(d);
    const b = buckets.get(key) ?? { inflow: 0, outflow: 0 };
    running += b.inflow - b.outflow;
    points.push({
      date: key,
      label: DAY_LABEL(d),
      inflow: b.inflow,
      outflow: -b.outflow, // negative => renders below the zero axis
      balance: running,
    });
  }
  return points;
}

const MONTH_LABELS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

/** Monthly sales (entrada · categoria=venda) over the last `months`. */
export function monthlySales(
  movements: Movement[],
  months = 12,
  today = new Date(),
): MonthlySalesPoint[] {
  const buckets = new Map<string, number>();
  for (const m of movements) {
    if (m.type !== "entrada" || m.category !== "venda") continue;
    const key = m.due_date.slice(0, 7); // YYYY-MM
    buckets.set(key, (buckets.get(key) ?? 0) + m.amount);
  }

  const points: MonthlySalesPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    points.push({
      month: key,
      label: MONTH_LABELS[d.getMonth()],
      total: buckets.get(key) ?? 0,
    });
  }
  return points;
}
