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

/** Fim da semana corrente (domingo). */
function endOfWeekISO(today: Date): string {
  const d = new Date(today);
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); // 0 = domingo
  return isoDay(d);
}

/**
 * Resumo de uma direção (entrada/saída):
 *  • today  — realizado HOJE (status pago, paid_date = hoje);
 *  • week   — a receber/pagar ESSA SEMANA (pendente, vence até domingo);
 *  • month  — a receber/pagar ESSE MÊS (pendente, vence até o fim do mês).
 * `week` ⊆ `month` (ambos a partir de hoje). Correlaciona com os movimentos
 * reais do sistema (demo: seed/importado; live: Supabase).
 */
function summarizeOpen(
  movements: Movement[],
  today: Date,
): ReceivablesSummary {
  const todayISO = isoDay(today);
  const eow = endOfWeekISO(today);
  const eom = endOfMonthISO(today);
  let realizadoHoje = 0,
    week = 0,
    month = 0,
    count = 0;

  for (const m of movements) {
    if (m.status === "pago" && m.paid_date === todayISO) realizadoHoje += m.amount;
    if (m.status !== "pendente") continue;
    count++;
    if (m.due_date >= todayISO && m.due_date <= eow) week += m.amount;
    if (m.due_date >= todayISO && m.due_date <= eom) month += m.amount;
  }
  return { today: realizadoHoje, week, month, count };
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
    if (!m.reconciled && m.status !== "cancelado") {
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
    // realizado = só PAGO (exclui pendente/cancelado com paid_date solto),
    // igual a dailyCashflowRange/Projetado.
    const day = m.status === "pago" ? (m.paid_date ?? m.due_date) : null;
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

/**
 * Fluxo de caixa diário num intervalo [from, to] arbitrário (ex.: um mês).
 * Mesma regra de `dailyCashflow` (só liquidados, por paid_date), mas sem
 * "rolling window ending today" — usado pela Home navegável por mês.
 */
export function dailyCashflowRange(
  movements: Movement[],
  fromISO: string,
  toISO: string,
  saldoInicial = 0,
): DailyCashflowPoint[] {
  const buckets = new Map<string, { inflow: number; outflow: number }>();
  for (const m of movements) {
    if (m.status === "cancelado") continue;
    const day = m.paid_date ?? (m.status === "pago" ? m.due_date : null);
    if (!day || day < fromISO || day > toISO) continue;
    const b = buckets.get(day) ?? { inflow: 0, outflow: 0 };
    if (m.type === "entrada") b.inflow += m.amount;
    else b.outflow += m.amount;
    buckets.set(day, b);
  }
  const points: DailyCashflowPoint[] = [];
  let running = saldoInicial; // saldo ABSOLUTO de abertura do período
  const end = new Date(toISO + "T00:00:00");
  for (const d = new Date(fromISO + "T00:00:00"); d <= end; d.setDate(d.getDate() + 1)) {
    const key = isoDay(d);
    const b = buckets.get(key) ?? { inflow: 0, outflow: 0 };
    running += b.inflow - b.outflow;
    points.push({ date: key, label: DAY_LABEL(d), inflow: b.inflow, outflow: -b.outflow, balance: running });
  }
  return points;
}

/**
 * Fluxo de caixa diário [from, to] com PROJEÇÃO: dias <= hoje usam o realizado
 * (pagos por paid_date); dias > hoje usam o PREVISTO (pendentes por due_date).
 * `balance` é absoluto (parte de `saldoInicial`). Cada ponto marca `projetado`.
 */
export function dailyCashflowProjetado(
  movements: Movement[],
  fromISO: string,
  toISO: string,
  saldoInicial: number,
  hojeISO: string,
): DailyCashflowPoint[] {
  const buckets = new Map<string, { inflow: number; outflow: number }>();
  for (const m of movements) {
    if (m.status === "cancelado") continue;
    let day: string | null = null;
    if (m.status === "pago") day = m.paid_date ?? m.due_date; // realizado
    else if (m.due_date > hojeISO) day = m.due_date; // pendente FUTURO = previsto
    else continue; // pendente vencido/hoje não conta na linha de caixa
    if (!day || day < fromISO || day > toISO) continue;
    const b = buckets.get(day) ?? { inflow: 0, outflow: 0 };
    if (m.type === "entrada") b.inflow += m.amount;
    else b.outflow += m.amount;
    buckets.set(day, b);
  }
  const points: DailyCashflowPoint[] = [];
  let running = saldoInicial;
  const end = new Date(toISO + "T00:00:00");
  for (const d = new Date(fromISO + "T00:00:00"); d <= end; d.setDate(d.getDate() + 1)) {
    const key = isoDay(d);
    const b = buckets.get(key) ?? { inflow: 0, outflow: 0 };
    running += b.inflow - b.outflow;
    points.push({ date: key, label: DAY_LABEL(d), inflow: b.inflow, outflow: -b.outflow, balance: running, projetado: key > hojeISO });
  }
  return points;
}

/**
 * Faturamento mensal (toda a receita realizada/entrada) nos últimos `months`.
 * Conta qualquer entrada — não depende do texto "venda" — para refletir
 * corretamente as categorias reais de receita cadastradas.
 */
export function monthlySales(
  movements: Movement[],
  months = 12,
  today = new Date(),
): MonthlySalesPoint[] {
  const buckets = new Map<string, number>();
  for (const m of movements) {
    if (m.type !== "entrada" || m.status === "cancelado") continue;
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
