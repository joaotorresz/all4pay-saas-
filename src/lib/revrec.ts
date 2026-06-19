/**
 * Reconhecimento de receita (CPC 47 / IFRS 15) — contratos com receita diferida
 * apropriada ao longo da vigência. **demo**: localStorage; **live**: tabelas
 * `revenue_contracts` + `revenue_schedule` (0010, RLS por org). O cronograma
 * (períodos × valor) é gerado determinístico (linear) e a IA pode propor um
 * perfil melhor (ex.: milestone ponderado) — ver `/api/ai/revrec`.
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";

export type ModeloReceita = "subscription" | "usage" | "milestone";
export interface RevRecParcela { period: string; amount: number; recognized: boolean }
export interface RevRecContrato {
  id: string;
  customer: string;
  total: number;
  model: ModeloReceita;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  criadoEm: string;
  parcelas: RevRecParcela[];
}

const KEY = "a4p_revrec";
const uid = () => globalThis.crypto?.randomUUID?.() ?? `rev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const round2 = (n: number) => Math.round(n * 100) / 100;
const primeiroDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;

/** Meses (1º dia) de start a end, inclusive. */
export function mesesEntre(start: string, end: string): string[] {
  const a = new Date(start + "T00:00:00");
  const b = new Date(end + "T00:00:00");
  if (isNaN(a.getTime()) || isNaN(b.getTime()) || b < a) return [primeiroDia(a.getTime() ? a : new Date())];
  const out: string[] = [];
  const cur = new Date(a.getFullYear(), a.getMonth(), 1);
  const fim = new Date(b.getFullYear(), b.getMonth(), 1);
  while (cur <= fim) { out.push(primeiroDia(cur)); cur.setMonth(cur.getMonth() + 1); }
  return out;
}

/** Cronograma linear (deferral em partes iguais; última parcela absorve o resto). */
export function cronogramaLinear(total: number, start: string, end: string): RevRecParcela[] {
  const meses = mesesEntre(start, end);
  const base = round2(total / meses.length);
  return meses.map((period, i) => ({
    period,
    amount: i === meses.length - 1 ? round2(total - base * (meses.length - 1)) : base,
    recognized: false,
  }));
}

/* ----------------------------- demo ----------------------------- */
function loadLocal(): RevRecContrato[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]") as RevRecContrato[]; } catch { return []; }
}
function saveLocal(list: RevRecContrato[]): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

/* ----------------------------- live ----------------------------- */
interface ContratoRow { id: string; customer: string | null; total: number; model: ModeloReceita; start_date: string | null; end_date: string | null; created_at: string; revenue_schedule?: Array<{ period: string; amount: number; recognized: boolean }> }
function fromRow(r: ContratoRow): RevRecContrato {
  return {
    id: r.id, customer: r.customer ?? "—", total: Number(r.total), model: r.model,
    startDate: r.start_date ?? "", endDate: r.end_date ?? "", criadoEm: r.created_at,
    parcelas: (r.revenue_schedule ?? []).map((s) => ({ period: String(s.period).slice(0, 10), amount: Number(s.amount), recognized: !!s.recognized })).sort((a, b) => a.period.localeCompare(b.period)),
  };
}

export async function listRevRec(): Promise<RevRecContrato[]> {
  if (isDemo) return loadLocal().sort((a, b) => (b.criadoEm < a.criadoEm ? -1 : 1));
  try {
    const { data, error } = await createClient()
      .from("revenue_contracts")
      .select("id,customer,total,model,start_date,end_date,created_at,revenue_schedule(period,amount,recognized)")
      .order("created_at", { ascending: false });
    if (error) return [];
    return ((data ?? []) as unknown as ContratoRow[]).map(fromRow);
  } catch { return []; }
}

export interface NovoRevRec { customer: string; total: number; model: ModeloReceita; startDate: string; endDate: string; parcelas: RevRecParcela[] }

export async function criarRevRec(n: NovoRevRec): Promise<RevRecContrato> {
  const contrato: RevRecContrato = { id: uid(), customer: n.customer, total: n.total, model: n.model, startDate: n.startDate, endDate: n.endDate, criadoEm: new Date().toISOString(), parcelas: n.parcelas };
  if (isDemo) { saveLocal([contrato, ...loadLocal()]); return contrato; }
  const s = createClient();
  const { data } = await s.from("revenue_contracts")
    .insert({ customer: n.customer, total: n.total, model: n.model, start_date: n.startDate, end_date: n.endDate })
    .select("id,customer,total,model,start_date,end_date,created_at").single();
  const id = (data as { id?: string })?.id ?? contrato.id;
  if (n.parcelas.length) {
    await s.from("revenue_schedule").insert(n.parcelas.map((p) => ({ contract_id: id, period: p.period, amount: p.amount, recognized: p.recognized })));
  }
  return { ...contrato, id };
}

export async function reconhecerParcela(contratoId: string, period: string): Promise<void> {
  if (isDemo) {
    const list = loadLocal();
    const next = list.map((c) => c.id !== contratoId ? c : { ...c, parcelas: c.parcelas.map((p) => p.period === period ? { ...p, recognized: true } : p) });
    saveLocal(next); return;
  }
  await createClient().from("revenue_schedule").update({ recognized: true }).eq("contract_id", contratoId).eq("period", period);
}

/** Resumo: total contratado · reconhecido · diferido (a reconhecer). */
export function resumoRevRec(contratos: RevRecContrato[]) {
  let total = 0, reconhecido = 0;
  for (const c of contratos) for (const p of c.parcelas) { total += p.amount; if (p.recognized) reconhecido += p.amount; }
  return { total: round2(total), reconhecido: round2(reconhecido), diferido: round2(total - reconhecido) };
}
