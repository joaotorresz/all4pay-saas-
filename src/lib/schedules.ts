/**
 * Cronogramas (amortização/depreciação) — **demo**: store local (com seed para a
 * tela não nascer vazia); **live**: tabela `schedules` (Postgres, RLS por org).
 * Mapeamento: tipo→kind (amortizacao→prepaid · depreciacao→fixed_asset),
 * descricao+categoria→description (a categoria, sem coluna própria, vai packed
 * após um separador US `\u001f` e é desempacotada na leitura — lossless).
 */
import type { Cronograma } from "@/core/schedules";
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import { TETO_LINHAS } from "@/lib/supabase/consulta";
import { reportar } from "@/lib/erros";

const KEY = "a4p_cronogramas";
const SEP = "\u001f";
const uid = () => globalThis.crypto?.randomUUID?.() ?? `cr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

function primeiroDiaMesesAtras(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

const SEED: Cronograma[] = [
  { id: "seed-amort-1", tipo: "amortizacao", descricao: "Licença de software (anual)", valorTotal: 12000, residual: 0, meses: 12, inicio: primeiroDiaMesesAtras(3), categoria: "Assinaturas / Software" },
  { id: "seed-amort-2", tipo: "amortizacao", descricao: "Seguro empresarial (anual)", valorTotal: 6000, residual: 0, meses: 12, inicio: primeiroDiaMesesAtras(1), categoria: "Seguros" },
  { id: "seed-deprec-1", tipo: "depreciacao", descricao: "Notebooks (lote)", valorTotal: 18000, residual: 1800, meses: 36, inicio: primeiroDiaMesesAtras(6), categoria: "Equipamentos de TI" },
];

/* ----------------------------- demo (localStorage) ----------------------------- */
function loadLocal(): Cronograma[] {
  if (typeof window === "undefined") return SEED;
  try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw) as Cronograma[]; } catch { /* ignore */ }
  return SEED;
}
function persistLocal(list: Cronograma[]): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

/* ----------------------------- live (schedules) ----------------------------- */
type Row = { id: string; kind: string; description: string | null; total: number; residual: number; start_period: string; periods: number };

function rowToCronograma(r: Row): Cronograma {
  const [descricao, categoria = ""] = (r.description ?? "").split(SEP);
  return {
    id: r.id,
    tipo: r.kind === "fixed_asset" ? "depreciacao" : "amortizacao",
    descricao, categoria,
    valorTotal: Number(r.total), residual: Number(r.residual),
    meses: Number(r.periods), inicio: String(r.start_period).slice(0, 10),
  };
}
function cronogramaToRow(c: Omit<Cronograma, "id">) {
  return {
    kind: c.tipo === "depreciacao" ? "fixed_asset" : "prepaid",
    description: c.categoria ? `${c.descricao}${SEP}${c.categoria}` : c.descricao,
    total: c.valorTotal, residual: c.residual ?? 0,
    start_period: c.inicio, periods: c.meses, method: "straight_line",
  };
}

export async function loadCronogramas(): Promise<Cronograma[]> {
  if (isDemo) return loadLocal();
  try {
    const { data, error } = await createClient()
      .from("schedules")
      .select("id,kind,description,total,residual,start_period,periods")
      .order("created_at", { ascending: true }).limit(TETO_LINHAS);
    if (error) return [];
    return ((data ?? []) as Row[]).map(rowToCronograma);
  } catch (e) {
    reportar("relatorio.cronogramas", e, "os cronogramas não carregam", true); return []; }
}

export async function salvarCronograma(c: Omit<Cronograma, "id"> & { id?: string }): Promise<Cronograma[]> {
  if (isDemo) {
    const list = loadLocal();
    const next = c.id ? list.map((x) => (x.id === c.id ? ({ ...x, ...c, id: c.id } as Cronograma) : x)) : [...list, { ...c, id: uid() } as Cronograma];
    persistLocal(next); return next;
  }
  const sb = createClient();
  const row = cronogramaToRow(c);
  if (c.id) await sb.from("schedules").update(row).eq("id", c.id);
  else await sb.from("schedules").insert(row);
  return loadCronogramas();
}

export async function removerCronograma(id: string): Promise<Cronograma[]> {
  if (isDemo) { const next = loadLocal().filter((x) => x.id !== id); persistLocal(next); return next; }
  const { excluirLogico } = await import("@/lib/exclusao");
  await excluirLogico("schedules", id);
  return loadCronogramas();
}
