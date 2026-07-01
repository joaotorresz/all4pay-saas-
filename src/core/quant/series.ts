/** Série mensal realizada (entradas/saídas pagas) — base de crescimento,
 * volatilidade e recorrência. */
import type { RiskInput } from "@/core/risk-engine/types";

const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export interface MesPonto {
  ym: string;
  label: string;
  receita: number;
  despesa: number;
  liquido: number;
}

export function serieMensal(input: RiskInput, meses = 12): MesPonto[] {
  const base = new Date(input.hoje);
  const pts: MesPonto[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    pts.push({ ym, label: MES[d.getMonth()], receita: 0, despesa: 0, liquido: 0 });
  }
  const idx = new Map(pts.map((p, i) => [p.ym, i]));
  for (const m of input.movements) {
    if (m.status !== "pago") continue;
    const ym = (m.paid_date ?? m.due_date).slice(0, 7);
    const i = idx.get(ym);
    if (i == null) continue;
    if (m.type === "entrada") pts[i].receita += m.amount;
    else pts[i].despesa += m.amount;
  }
  pts.forEach((p) => (p.liquido = p.receita - p.despesa));
  return pts;
}

/** Share de receita recorrente: clientes presentes em ≥3 meses distintos. */
export function receitaRecorrente(input: RiskInput, meses = 12): number {
  const base = new Date(input.hoje);
  // corte local (não UTC) p/ não deslocar o mês em fuso negativo no início do mês
  const c = new Date(base.getFullYear(), base.getMonth() - (meses - 1), 1);
  const corte = `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, "0")}`;
  const mesesPorCliente = new Map<string, Set<string>>();
  const receitaPorCliente = new Map<string, number>();
  let total = 0;
  for (const m of input.movements) {
    if (m.type !== "entrada" || m.status !== "pago") continue;
    const ym = (m.paid_date ?? m.due_date).slice(0, 7);
    if (ym < corte) continue;
    const id = m.party_id ?? "—";
    (mesesPorCliente.get(id) ?? mesesPorCliente.set(id, new Set()).get(id)!).add(ym);
    receitaPorCliente.set(id, (receitaPorCliente.get(id) ?? 0) + m.amount);
    total += m.amount;
  }
  if (total === 0) return 0;
  let recorrente = 0;
  for (const [id, set] of Array.from(mesesPorCliente))
    if (set.size >= 3) recorrente += receitaPorCliente.get(id) ?? 0;
  return recorrente / total;
}
