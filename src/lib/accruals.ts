/**
 * Provisões / accruals (regime de COMPETÊNCIA) — sugere provisionar despesas
 * recorrentes que ainda NÃO foram lançadas no mês corrente. Determinístico
 * (média das despesas por categoria nos últimos meses) — a IA pode refinar
 * (ver `/api/ai/accruals`). Cada provisão postada no razão debita a conta de
 * despesa da categoria e credita "2.1.99 Provisões a pagar".
 */
import type { RiskInput } from "@/core/risk-engine/types";
import { contaDeMovimento } from "@/core/ledger/chart";

import { formatBRL } from "@/lib/format";
export interface AccrualSugerido {
  categoria: string;
  valor: number;        // média mensal (provisão sugerida)
  conta: string;        // conta de despesa (débito)
  mesesPresentes: number;
  motivo: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const mesDe = (iso: string) => (iso || "").slice(0, 7);
function mesesAtras(mesAtualYM: string, n: number): string[] {
  const [y, m] = mesAtualYM.split("-").map(Number);
  const out: string[] = [];
  for (let i = 1; i <= n; i++) { const d = new Date(y, m - 1 - i, 1); out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); }
  return out;
}

/** Despesas recorrentes (≥3 dos últimos 4 meses) sem lançamento no mês corrente. */
export function sugerirAccruals(input: RiskInput, janela = 4): AccrualSugerido[] {
  const mesAtual = mesDe(input.hoje);
  const meses = mesesAtras(mesAtual, janela);
  const set = new Set(meses);
  const desp = input.movements.filter((m) => m.type === "saida" && (m.category ?? "").trim() && (m.category ?? "") !== "Transferência");

  // por categoria: meses presentes na janela + total; e se já há no mês corrente
  const porCat = new Map<string, { porMes: Map<string, number>; noMesAtual: number }>();
  for (const m of desp) {
    const cat = (m.category ?? "").trim();
    const ym = mesDe(m.due_date || m.paid_date || input.hoje);
    const e = porCat.get(cat) ?? { porMes: new Map(), noMesAtual: 0 };
    if (ym === mesAtual) e.noMesAtual += Math.abs(m.amount);
    else if (set.has(ym)) e.porMes.set(ym, (e.porMes.get(ym) ?? 0) + Math.abs(m.amount));
    porCat.set(cat, e);
  }

  const out: AccrualSugerido[] = [];
  for (const [categoria, e] of Array.from(porCat.entries())) {
    const presentes = e.porMes.size;
    if (presentes < 3 || e.noMesAtual > 0) continue; // recorrente E ainda não lançada no mês
    const total = Array.from(e.porMes.values()).reduce((s, v) => s + v, 0);
    const media = round2(total / presentes);
    if (media <= 0) continue;
    out.push({
      categoria, valor: media,
      conta: contaDeMovimento({ type: "saida", category: categoria }),
      mesesPresentes: presentes,
      motivo: `Recorrente em ${presentes} dos últimos ${janela} meses (média ${formatBRL(media)}); sem lançamento em ${mesAtual}.`,
    });
  }
  return out.sort((a, b) => b.valor - a.valor);
}
