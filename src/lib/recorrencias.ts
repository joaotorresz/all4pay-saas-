/**
 * Recorrências — motor de receita previsível (MRR) do funil RECEBER.
 * Um contrato (cliente + itens do catálogo + ciclo) projeta as PRÓXIMAS FATURAS
 * como `movements` de entrada PREVISTOS no hub — alimentando /recebiveis, fluxo
 * previsto, DRE e risco com receita CONTRATADA (não estimada). Reusa o catálogo
 * (Produtos/Serviços) e a Cobrança existente. Store local (demo-safe).
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import { isoDay } from "@/lib/aggregations";
import { appendImported, removerImported } from "@/lib/imported";
import type { Movement } from "@/lib/types";

export type Ciclo = "semanal" | "mensal" | "bimestral" | "trimestral" | "quadrimestral" | "semestral" | "anual";
export const CICLOS: { id: Ciclo; label: string; meses: number }[] = [
  { id: "semanal", label: "Semanal", meses: 0.25 },
  { id: "mensal", label: "Mensal", meses: 1 },
  { id: "bimestral", label: "Bimestral", meses: 2 },
  { id: "trimestral", label: "Trimestral", meses: 3 },
  { id: "quadrimestral", label: "Quadrimestral", meses: 4 },
  { id: "semestral", label: "Semestral", meses: 6 },
  { id: "anual", label: "Anual", meses: 12 },
];
const mesesDe = (c: Ciclo) => CICLOS.find((x) => x.id === c)?.meses ?? 1;

export interface ItemRec { nome: string; valor: number; qtd: number }
export type StatusRec = "rascunho" | "ativa" | "pausada" | "cancelada";

export interface Recorrencia {
  id: string;
  titulo: string;
  clienteId: string;
  clienteNome: string;
  itens: ItemRec[];
  ciclo: Ciclo;
  diaFaturamento: number;
  classificacao?: string;
  centro?: string;
  status: StatusRec;
  movimentos: string[]; // ids das faturas projetadas no hub
  criadoEm: string;
}

const KEY = "a4p_recorrencias";
let cache: Recorrencia[] | undefined;
function load(): Recorrencia[] {
  if (cache) return cache;
  if (typeof window === "undefined") { cache = []; return cache; }
  try { cache = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { cache = []; }
  return cache!;
}
function save(list: Recorrencia[]) {
  cache = list;
  if (typeof window !== "undefined") { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ } }
}

export const totalFatura = (r: Pick<Recorrencia, "itens">) => r.itens.reduce((s, it) => s + it.valor * it.qtd, 0);

export function listRecorrencias(): Recorrencia[] {
  return [...load()].sort((a, b) => (b.criadoEm < a.criadoEm ? -1 : 1));
}

// ---------- KPIs de assinatura ----------
export interface KpisRecorrencia { mrr: number; ativas: number; ticketMedio: number; churn: number; total: number }
export function kpisRecorrencia(): KpisRecorrencia {
  const list = load();
  const ativas = list.filter((r) => r.status === "ativa");
  const mrr = ativas.reduce((s, r) => s + totalFatura(r) / mesesDe(r.ciclo), 0);
  const ticketMedio = ativas.length ? ativas.reduce((s, r) => s + totalFatura(r), 0) / ativas.length : 0;
  const churn = list.length ? list.filter((r) => r.status === "cancelada").length / list.length : 0;
  return { mrr, ativas: ativas.length, ticketMedio, churn, total: list.length };
}

// ---------- Projeção das próximas faturas ----------
export interface FaturaPrevista { data: string; vencimento: string; valor: number; periodo: string }
export function projetarProximasFaturas(r: Recorrencia, n = 6): FaturaPrevista[] {
  const valor = totalFatura(r);
  const meses = mesesDe(r.ciclo);
  const base = new Date(); base.setHours(0, 0, 0, 0);
  const out: FaturaPrevista[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(base);
    if (meses < 1) d.setDate(d.getDate() + Math.round(meses * 30) * i);
    else { d.setMonth(d.getMonth() + meses * i); d.setDate(Math.min(r.diaFaturamento || d.getDate(), 28)); }
    const venc = new Date(d); venc.setDate(venc.getDate() + 5); // condição padrão D+5
    out.push({ data: isoDay(d), vencimento: isoDay(venc), valor, periodo: `${d.toLocaleString("pt-BR", { month: "short", year: "2-digit" })}` });
  }
  return out;
}

// ---------- Ações ----------
export interface NovaRecorrencia {
  titulo: string; clienteId: string; clienteNome: string; itens: ItemRec[];
  ciclo: Ciclo; diaFaturamento: number; classificacao?: string; centro?: string;
}
export function criarRecorrencia(n: NovaRecorrencia): Recorrencia {
  const r: Recorrencia = {
    id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    ...n, status: "rascunho", movimentos: [], criadoEm: new Date().toISOString(),
  };
  save([r, ...load()]);
  return r;
}

/** Aprova/ativa o contrato → projeta as próximas faturas como entrada PREVISTA no hub. */
export async function ativarRecorrencia(id: string, horizonte = 6): Promise<void> {
  const list = load();
  const r = list.find((x) => x.id === id);
  if (!r || r.status === "ativa") return;
  const faturas = projetarProximasFaturas(r, horizonte);
  const ids: string[] = [];
  if (isDemo) {
    faturas.forEach((f, i) => {
      const mid = `${r.id}-fat${i}`;
      const movement: Movement = {
        id: mid, account_id: "", type: "entrada", status: "pendente",
        category: r.classificacao || r.itens[0]?.nome || "Receita recorrente",
        amount: f.valor, party_id: r.clienteId, due_date: f.vencimento, paid_date: null,
        reconciled: false, description: `${r.titulo} · ${f.periodo}`,
      } as Movement;
      appendImported({ movement });
      ids.push(mid);
    });
  } else {
    const supabase = createClient();
    const { data: accs } = await supabase.from("financial_accounts").select("id").limit(1);
    const accId = (accs as { id: string }[] | null)?.[0]?.id;
    if (accId) {
      const rows = faturas.map((f) => ({
        account_id: accId, type: "entrada", status: "pendente",
        category: r.classificacao || r.itens[0]?.nome || "Receita recorrente",
        amount: f.valor, party_id: r.clienteId, due_date: f.vencimento, paid_date: null,
        reconciled: false, description: `${r.titulo} · ${f.periodo}`,
      }));
      const { data } = await supabase.from("movements").insert(rows).select("id");
      for (const row of (data ?? []) as { id: string }[]) ids.push(row.id);
    }
  }
  r.movimentos = ids; r.status = "ativa";
  save([...list]);
}

/** Pausa ou cancela (churn) → remove as faturas previstas do fluxo. */
export async function encerrarRecorrencia(id: string, status: "pausada" | "cancelada"): Promise<void> {
  const list = load();
  const r = list.find((x) => x.id === id);
  if (!r) return;
  if (r.movimentos.length) {
    if (isDemo) removerImported(r.movimentos);
    else { const s = createClient(); await s.from("movements").delete().in("id", r.movimentos); }
  }
  r.movimentos = []; r.status = status;
  save([...list]);
}

export function clearRecorrencias(): void { save([]); }
