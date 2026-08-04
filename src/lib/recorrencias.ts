/**
 * Recorrências — motor de receita previsível (MRR) do funil RECEBER.
 * Contrato (cliente + itens do catálogo + ciclo) projeta as próximas faturas
 * como `movements` de entrada PREVISTOS no hub. Demo-safe (padrão cache+hydrate
 * da Onda 1.2):
 *  • demo → localStorage + roll-forward client-side (rolarRecorrencias);
 *  • live → tabela `public.recurrences` (com `itens jsonb` + `freq` 7 ciclos);
 *    o Cron `/api/recorrencias/run` materializa as faturas (idempotente).
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import { isoDay } from "@/lib/aggregations";
import { appendImported, removerImported, importedMovements } from "@/lib/imported";
import { datasFaturaCron, cicloParaFreq, refFatura } from "@/lib/recorrencias-sched";
import { mrr as mrrCanonico } from "@/core/indicadores";
import type { Movement } from "@/lib/types";
import { TETO_LINHAS } from "@/lib/supabase/consulta";

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
const cicloValido = (f: string): Ciclo => (CICLOS.some((c) => c.id === f) ? (f as Ciclo) : "mensal");

export interface ItemRec { nome: string; valor: number; qtd: number; categoria?: string }
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
  movimentos: string[];
  projetadas?: number;
  criadoEm: string;
}

const KEY = "a4p_recorrencias";
let cache: Recorrencia[] | undefined;
let hydrated = false;
function loadLocal(): Recorrencia[] {
  if (cache) return cache;
  if (typeof window === "undefined") { cache = []; return cache; }
  try { cache = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { cache = []; }
  return cache!;
}
function saveLocal(list: Recorrencia[]) {
  cache = list;
  if (typeof window !== "undefined") { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ } }
}

export const totalFatura = (r: Pick<Recorrencia, "itens">) => r.itens.reduce((s, it) => s + it.valor * it.qtd, 0);

// ---------- live ↔ tabela recurrences ----------
type Embed = { name: string } | { name: string }[] | null | undefined;
const nomeEmbed = (p: Embed) => (Array.isArray(p) ? (p[0]?.name ?? "Cliente") : (p?.name ?? "Cliente"));
interface RecRow {
  id: string; party_id: string | null; description: string; amount: number; freq: string;
  start_date: string; due_day: number | null; active: boolean; itens: ItemRec[]; created_at: string;
  parties?: Embed;
}
function fromRow(r: RecRow): Recorrencia {
  const itens: ItemRec[] = Array.isArray(r.itens) && r.itens.length
    ? r.itens
    : [{ nome: r.description, valor: Number(r.amount), qtd: 1, categoria: r.description }];
  return {
    id: r.id, titulo: r.description, clienteId: r.party_id ?? "", clienteNome: nomeEmbed(r.parties),
    itens, ciclo: cicloValido(r.freq), diaFaturamento: r.due_day ?? 1, classificacao: itens[0]?.categoria,
    status: r.active ? "ativa" : "pausada", movimentos: [], projetadas: 0, criadoEm: r.created_at,
  };
}

export async function hydrateRecorrencias(force = false): Promise<void> {
  if (hydrated && !force) return;
  if (isDemo) { cache = loadLocal(); hydrated = true; return; }
  try {
    const { data } = await createClient().from("recurrences")
      .select("id,party_id,description,amount,freq,start_date,due_day,active,itens,created_at,parties(name)")
      .eq("type", "entrada").order("created_at", { ascending: false }).limit(TETO_LINHAS);
    cache = ((data ?? []) as unknown as RecRow[]).map(fromRow);
    hydrated = true;
  } catch { cache = cache ?? []; }
}

export function listRecorrencias(): Recorrencia[] {
  return [...(cache ?? [])].sort((a, b) => (b.criadoEm < a.criadoEm ? -1 : 1));
}

// ---------- KPIs ----------
export interface KpisRecorrencia { mrr: number; ativas: number; ticketMedio: number; churn: number; total: number }
export function kpisRecorrencia(): KpisRecorrencia {
  const list = cache ?? [];
  const ativas = list.filter((r) => r.status === "ativa");
  // MRR pelo indicador canônico (`core/indicadores.mrr`): a normalização do
  // ciclo é a regra e vive num lugar só.
  const mrr = mrrCanonico(
    { hoje: "1970-01-01", saldoAtual: 0, movements: [] },
    ativas.map((r) => ({ ativo: true, valorCiclo: totalFatura(r), mesesCiclo: mesesDe(r.ciclo) })),
  ).valor;
  const ticketMedio = ativas.length ? ativas.reduce((s, r) => s + totalFatura(r), 0) / ativas.length : 0;
  const churn = list.length ? list.filter((r) => r.status === "cancelada").length / list.length : 0;
  return { mrr, ativas: ativas.length, ticketMedio, churn, total: list.length };
}

// ---------- Projeção (UI preview) ----------
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
    const venc = new Date(d); venc.setDate(venc.getDate() + 5);
    out.push({ data: isoDay(d), vencimento: isoDay(venc), valor, periodo: d.toLocaleString("pt-BR", { month: "short", year: "2-digit" }) });
  }
  return out;
}

// ---------- Ações ----------
export interface NovaRecorrencia {
  titulo: string; clienteId: string; clienteNome: string; itens: ItemRec[];
  ciclo: Ciclo; diaFaturamento: number; classificacao?: string; centro?: string;
}
export async function criarRecorrencia(n: NovaRecorrencia): Promise<Recorrencia> {
  await hydrateRecorrencias();
  const itens = n.itens.map((it) => ({ ...it, categoria: it.categoria ?? n.classificacao }));
  if (isDemo) {
    const r: Recorrencia = {
      id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      ...n, itens, status: "rascunho", movimentos: [], criadoEm: new Date().toISOString(),
    };
    saveLocal([r, ...loadLocal()]);
    return r;
  }
  // live: persiste o rascunho com itens jsonb + freq REAL (7 ciclos).
  const { data } = await createClient().from("recurrences").insert({
    party_id: /^[0-9a-f-]{36}$/i.test(n.clienteId) ? n.clienteId : null, type: "entrada",
    description: n.titulo, amount: totalFatura({ itens }), freq: cicloParaFreq(n.ciclo),
    start_date: isoDay(new Date()), due_day: n.diaFaturamento, active: false, itens,
  }).select("id,party_id,description,amount,freq,start_date,due_day,active,itens,created_at").single();
  const saved = data ? fromRow({ ...(data as RecRow), parties: { name: n.clienteNome } }) : null;
  const r = saved ?? { id: `rec-${Date.now()}`, ...n, itens, status: "rascunho" as StatusRec, movimentos: [], criadoEm: new Date().toISOString() };
  r.clienteNome = n.clienteNome; r.status = "rascunho";
  cache = [r, ...(cache ?? [])];
  return r;
}

/** Ativa o contrato → materializa as faturas (mesmas datas do Cron, dedup garantido). */
export async function ativarRecorrencia(id: string): Promise<void> {
  await hydrateRecorrencias();
  const list = cache ?? [];
  const r = list.find((x) => x.id === id);
  if (!r || r.status === "ativa") return;

  if (isDemo) {
    const faturas = projetarProximasFaturas(r, 6);
    const ids: string[] = [];
    faturas.forEach((f, i) => {
      const mid = `${r.id}-fat${i}`;
      appendImported({ movement: {
        id: mid, account_id: "", type: "entrada", status: "pendente",
        category: r.classificacao || r.itens[0]?.nome || "Receita recorrente",
        amount: f.valor, party_id: r.clienteId, due_date: f.vencimento, paid_date: null,
        reconciled: false, description: `${r.titulo} · ${f.periodo}`,
        reference_code: refFatura(r.id, f.vencimento),
      } as Movement });
      ids.push(mid);
    });
    r.movimentos = ids; r.projetadas = ids.length; r.status = "ativa";
    saveLocal([...list]);
    return;
  }

  const supabase = createClient();
  await supabase.from("recurrences").update({ active: true }).eq("id", r.id);
  const { data: accs } = await supabase.from("financial_accounts").select("id").limit(1);
  const accId = (accs as { id: string }[] | null)?.[0]?.id;
  if (accId) {
    // Faturas nas MESMAS datas do Cron; idempotência GARANTIDA pelo índice único
    // parcial (insere; ignora 23505). Race-safe entre ativar e o Cron.
    const datas = datasFaturaCron(isoDay(new Date()), cicloParaFreq(r.ciclo), r.diaFaturamento, isoDay(new Date()), 180);
    for (const d of datas) {
      const { error } = await supabase.from("movements").insert({
        account_id: accId, type: "entrada", status: "pendente",
        category: r.classificacao || r.itens[0]?.nome || "Receita recorrente",
        amount: totalFatura(r), party_id: r.clienteId || null, due_date: d, paid_date: null,
        reconciled: false, description: r.titulo, reference_code: refFatura(r.id, d),
      });
      if (!error || error.code === "23505") continue;
    }
  }
  r.status = "ativa";
  cache = [...list];
}

/** Roll-forward demo (o Cron cobre o live). */
export async function rolarRecorrencias(): Promise<number> {
  if (!isDemo) { await hydrateRecorrencias(); return 0; } // live: Cron /api/recorrencias/run
  const list = loadLocal();
  const movs = importedMovements() ?? [];
  const hoje = isoDay(new Date());
  let novas = 0;
  for (const r of list) {
    if (r.status !== "ativa") continue;
    const futuras = movs.filter((m) => m.id.startsWith(`${r.id}-fat`) && m.status === "pendente" && m.due_date >= hoje).length;
    if (futuras >= 3) continue;
    const projetadas = r.projetadas ?? r.movimentos.length;
    // Dedup por vencimento: projetarProximasFaturas parte SEMPRE de hoje e cobre
    // 6 meses, sobrepondo as faturas pendentes que ainda restam. Sem isto, o
    // top-up cria uma 2ª fatura (id novo) p/ o mesmo mês → MRR/recebíveis em dobro.
    const jaTem = new Set(
      movs.filter((m) => m.id.startsWith(`${r.id}-fat`) && m.status === "pendente").map((m) => m.due_date),
    );
    projetarProximasFaturas(r, 6).forEach((f, k) => {
      if (jaTem.has(f.vencimento)) return; // já há fatura pendente p/ esse vencimento
      const mid = `${r.id}-fat${projetadas + k}`;
      appendImported({ movement: {
        id: mid, account_id: "", type: "entrada", status: "pendente",
        category: r.classificacao || r.itens[0]?.nome || "Receita recorrente",
        amount: f.valor, party_id: r.clienteId, due_date: f.vencimento, paid_date: null,
        reconciled: false, description: `${r.titulo} · ${f.periodo}`,
        reference_code: refFatura(r.id, f.vencimento),
      } as Movement });
      r.movimentos.push(mid); novas++;
      jaTem.add(f.vencimento);
    });
    r.projetadas = projetadas + 6;
  }
  if (novas) saveLocal([...list]);
  return novas;
}

/** Pausa ou cancela (churn) → remove as faturas previstas do fluxo. */
export async function encerrarRecorrencia(id: string, status: "pausada" | "cancelada"): Promise<void> {
  const list = cache ?? [];
  const r = list.find((x) => x.id === id);
  if (!r) return;
  if (isDemo) {
    if (r.movimentos.length) removerImported(r.movimentos);
    r.movimentos = []; r.status = status;
    saveLocal([...list]);
    return;
  }
  const s = createClient();
  await s.from("recurrences").update({ active: false }).eq("id", r.id);
  // remove faturas FUTURAS pendentes desta recorrência (não toca o já realizado)
  await s.from("movements").delete().like("reference_code", `rec:${r.id}:%`).eq("status", "pendente").gte("due_date", isoDay(new Date()));
  r.status = status;
  cache = [...list];
}

export function clearRecorrencias(): void { saveLocal([]); }
