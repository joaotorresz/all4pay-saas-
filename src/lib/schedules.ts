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
import { ler as lerOrg, gravar as gravarOrg } from "@/lib/store-org";

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
// Só a DEMONSTRAÇÃO grava aqui (produção: `schedules`; chave CONGELADA).
function loadLocal(): Cronograma[] {
  return lerOrg<Cronograma[] | null>(KEY, null) ?? SEED;
}
function persistLocal(list: Cronograma[]): void {
  gravarOrg(KEY, list);
}

/* ----------------------------- live (schedules) ----------------------------- */
type Row = { id: string; kind: string; description: string | null; total: number; residual: number; start_period: string; periods: number; movement_id: string | null };

function rowToCronograma(r: Row): Cronograma {
  const [descricao, categoria = ""] = (r.description ?? "").split(SEP);
  return {
    id: r.id,
    tipo: r.kind === "fixed_asset" ? "depreciacao" : "amortizacao",
    descricao, categoria,
    valorTotal: Number(r.total), residual: Number(r.residual),
    meses: Number(r.periods), inicio: String(r.start_period).slice(0, 10),
    movimentoId: r.movement_id ?? null,
  };
}
function cronogramaToRow(c: Omit<Cronograma, "id">) {
  return {
    kind: c.tipo === "depreciacao" ? "fixed_asset" : "prepaid",
    description: c.categoria ? `${c.descricao}${SEP}${c.categoria}` : c.descricao,
    total: c.valorTotal, residual: c.residual ?? 0,
    start_period: c.inicio, periods: c.meses, method: "straight_line",
    // A compra que vira ativo no razão (nulo: bem anterior ao sistema).
    movement_id: c.movimentoId ?? null,
  };
}

export async function loadCronogramas(): Promise<Cronograma[]> {
  if (isDemo) return loadLocal();
  try {
    const { data, error } = await createClient()
      .from("schedules")
      .select("id,kind,description,total,residual,start_period,periods,movement_id")
      .order("created_at", { ascending: true }).limit(TETO_LINHAS);
    if (error) return [];
    return ((data ?? []) as Row[]).map(rowToCronograma);
  } catch (e) {
    reportar("relatorio.cronogramas", e, "os cronogramas não carregam", true); return []; }
}

export async function salvarCronograma(c: Omit<Cronograma, "id"> & { id?: string }): Promise<Cronograma[]> {
  if (isDemo) {
    const list = loadLocal();
    // A mesma regra do banco (índice schedules_uma_compra_por_cronograma).
    if (c.movimentoId && list.some((x) => x.id !== c.id && x.movimentoId === c.movimentoId)) {
      throw new Error("Esta compra já está ligada a outro cronograma: o bem seria depreciado duas vezes.");
    }
    const next = c.id ? list.map((x) => (x.id === c.id ? ({ ...x, ...c, id: c.id } as Cronograma) : x)) : [...list, { ...c, id: uid() } as Cronograma];
    persistLocal(next); return next;
  }
  const sb = createClient();
  const row = cronogramaToRow(c);
  // ⚠️ A recusa do banco (a mesma compra em dois cronogramas, compra de outra
  // empresa) vai para a tela com a mensagem real: antes o erro era engolido e
  // a tela recarregava como se tivesse gravado.
  const { error } = c.id
    ? await sb.from("schedules").update(row).eq("id", c.id)
    : await sb.from("schedules").insert(row);
  if (error) {
    if (error.code === "23505") throw new Error("Esta compra já está ligada a outro cronograma: o bem seria depreciado duas vezes.");
    throw new Error(error.message);
  }
  return loadCronogramas();
}

export async function removerCronograma(id: string): Promise<Cronograma[]> {
  if (isDemo) { const next = loadLocal().filter((x) => x.id !== id); persistLocal(next); return next; }
  const { excluirLogico } = await import("@/lib/exclusao");
  await excluirLogico("schedules", id);
  return loadCronogramas();
}
