/** ITEM 3 — MEDIÇÃO: por que o lado "Realizado" sai zerado. */
import { readFileSync } from "node:fs";
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";

const HOJE = "2026-08-13";
type G = [string, string, string, string, string | null, number, number];
const grupos = JSON.parse(readFileSync("scratchpad/base-joaov.json", "utf8")) as G[];
const movs: RiskMovement[] = grupos.map(([t, s, c, mc, mx, v], i) => ({
  id: `g${i}`, type: t as "entrada" | "saida", status: s as "pendente" | "pago" | "cancelado",
  amount: v, due_date: `${mc}-01`, paid_date: mx ? `${mx}-01` : null,
  category: c === "(sem categoria)" || c === "" ? null : c,
}));
const brl = (n: number) =>
  (n < 0 ? "−" : "") + Math.abs(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dias = 30;
const fim = new Date(new Date(HOJE + "T00:00:00").getTime() + dias * 864e5).toISOString().slice(0, 10);
console.log(`\nJanela do widget: ${HOJE} .. ${fim}  (${dias} dias À FRENTE)\n`);

// A MESMA aritmética do motor.
const grupoPR = new Map<string, { plan: number; real: number }>();
for (const m of movs) {
  if (m.status === "cancelado") continue;
  const dueNaJanela = m.due_date >= HOJE && m.due_date <= fim;
  const paidNaJanela = !!m.paid_date && m.paid_date >= HOJE && m.paid_date <= fim;
  if (!dueNaJanela && !paidNaJanela) continue;
  const k = m.category ?? "(sem categoria)";
  const cur = grupoPR.get(k) ?? { plan: 0, real: 0 };
  if (dueNaJanela) cur.plan += m.amount;
  if (m.status === "pago" && (paidNaJanela || dueNaJanela)) cur.real += m.amount;
  grupoPR.set(k, cur);
}
console.log("linha|Planejado|Realizado|%");
for (const [k, v] of Array.from(grupoPR.entries()).sort((a, b) => b[1].plan - a[1].plan).slice(0, 6)) {
  const pct = v.plan > 0 ? v.real / v.plan - 1 : 0;
  console.log(`${k}|${brl(v.plan)}|${brl(v.real)}|${Math.round(pct * 100)}%`);
}

/* ── A CAUSA ─────────────────────────────────────────────────────────────── */
const pagos = movs.filter((m) => m.status === "pago" && m.paid_date);
const pagosNoFuturo = pagos.filter((m) => (m.paid_date ?? "") >= HOJE);
console.log(`\n== POR QUE "REALIZADO" É ZERO ==`);
console.log(`lançamentos PAGOS na base            : ${pagos.length}`);
console.log(`  … com paid_date >= hoje (na janela): ${pagosNoFuturo.length}`);
console.log(`  … com paid_date <  hoje (passado)  : ${pagos.length - pagosNoFuturo.length}`);
console.log(`\nA janela é [hoje, hoje+${dias}d]. Pagamento acontece ANTES de hoje,`);
console.log(`então "realizado" quase nunca cai dentro dela — não é o join que falha.`);

/* ── O mesmo recorte, olhando para TRÁS ──────────────────────────────────── */
const de = new Date(new Date(HOJE + "T00:00:00").getTime() - dias * 864e5).toISOString().slice(0, 10);
const g2 = new Map<string, { plan: number; real: number }>();
for (const m of movs) {
  if (m.status === "cancelado") continue;
  const due = m.due_date >= de && m.due_date <= HOJE;
  const paid = !!m.paid_date && m.paid_date >= de && m.paid_date <= HOJE;
  if (!due && !paid) continue;
  const k = m.category ?? "(sem categoria)";
  const cur = g2.get(k) ?? { plan: 0, real: 0 };
  if (due) cur.plan += m.amount;
  if (m.status === "pago" && paid) cur.real += m.amount;
  g2.set(k, cur);
}
console.log(`\n== O MESMO WIDGET, JANELA PARA TRÁS (${de} .. ${HOJE}) ==`);
console.log("linha|Planejado|Realizado|%");
for (const [k, v] of Array.from(g2.entries()).sort((a, b) => b[1].plan - a[1].plan).slice(0, 6)) {
  const pct = v.plan > 0 ? v.real / v.plan - 1 : 0;
  console.log(`${k}|${brl(v.plan)}|${brl(v.real)}|${Math.round(pct * 100)}%`);
}
