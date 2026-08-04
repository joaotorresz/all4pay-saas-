/**
 * Conciliação Open Finance — casa transações do banco (movements de origem OF,
 * reference_code 'pluggy:%', já pagas) com TÍTULOS PENDENTES lançados (a receber/
 * a pagar) por valor + data + tipo + contraparte. Ao conciliar, o movimento do
 * banco HERDA a classificação do título (categoria/centro/contato) e o título
 * previsto é CANCELADO (vai para a Lixeira) — evita contar o mesmo dinheiro 2x.
 * Live-only (em demo não há Open Finance). Multi-tenant via RLS.
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import { TETO_LINHAS } from "@/lib/supabase/consulta";

export interface MatchConc {
  ofId: string; ofDesc: string; ofData: string;
  pendId: string; pendDesc: string; dueDate: string;
  tipo: "entrada" | "saida"; amount: number; confianca: number;
}
export interface ConciliacaoOF { matches: MatchConc[]; pendentesSemMatch: number; ofSemMatch: number }

export type RecomendacaoIA = "conciliar" | "revisar" | "rejeitar";
export interface AvaliacaoIA { recomendacao: RecomendacaoIA; confiancaIA: number; motivo: string }

/** IA disponível para desempatar pares ambíguos? */
export async function iaConciliacaoAtiva(): Promise<boolean> {
  try { return !!(await fetch("/api/ai/conciliar").then((r) => r.json()))?.configured; } catch { return false; }
}

/** Avalia com IA os pares ambíguos (confiança média) → mapa ofId→avaliação. */
export async function avaliarComIA(matches: MatchConc[]): Promise<Map<string, AvaliacaoIA>> {
  const out = new Map<string, AvaliacaoIA>();
  if (matches.length === 0) return out;
  const pares = matches.map((m) => ({
    ofId: m.ofId, ofDesc: m.ofDesc, ofData: m.ofData,
    pendDesc: m.pendDesc, dueDate: m.dueDate, valor: m.amount, tipo: m.tipo, confianca: m.confianca,
  }));
  try {
    const j = await fetch("/api/ai/conciliar", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ pares }),
    }).then((r) => r.json());
    if (j?.ok && Array.isArray(j.avaliacoes)) {
      for (const a of j.avaliacoes as Array<AvaliacaoIA & { ofId: string }>) {
        if (a?.ofId && a.recomendacao) out.set(a.ofId, { recomendacao: a.recomendacao, confiancaIA: Number(a.confiancaIA ?? 0), motivo: String(a.motivo ?? "") });
      }
    }
  } catch { /* sem IA: segue só o determinístico */ }
  return out;
}


/** Amostra determinística (demo) — mostra a confirmação profissional mesmo sem
 *  banco conectado. Em live os pares vêm do matching real abaixo. */
const DEMO_CONC: ConciliacaoOF = {
  matches: [
    { ofId: "of-1", ofDesc: "PIX recebido · ACME Ltda", ofData: "2026-06-12", pendId: "p-1", pendDesc: "NF 1042 · ACME Ltda", dueDate: "2026-06-12", tipo: "entrada", amount: 4800, confianca: 98 },
    { ofId: "of-2", ofDesc: "TED · Distribuidora Sul", ofData: "2026-06-10", pendId: "p-2", pendDesc: "Boleto fornecedor · Distribuidora Sul", dueDate: "2026-06-11", tipo: "saida", amount: 2350.9, confianca: 88 },
    { ofId: "of-3", ofDesc: "Débito · Posto Ipiranga", ofData: "2026-06-09", pendId: "p-3", pendDesc: "Combustível (previsto)", dueDate: "2026-06-07", tipo: "saida", amount: 520, confianca: 72 },
    { ofId: "of-4", ofDesc: "PIX recebido · João Mendes", ofData: "2026-06-08", pendId: "p-4", pendDesc: "Serviço · João Mendes", dueDate: "2026-06-05", tipo: "entrada", amount: 1200, confianca: 64 },
  ],
  pendentesSemMatch: 3,
  ofSemMatch: 5,
};

interface MovRow { id: string; type: "entrada" | "saida"; amount: number; due_date: string; paid_date: string | null; party_id: string | null; description: string | null }

const diasEntre = (a: string, b: string) => Math.abs(Math.round((Date.parse(a) - Date.parse(b)) / 86400000));

export async function getConciliacaoOF(): Promise<ConciliacaoOF | null> {
  if (isDemo) return DEMO_CONC;
  const supabase = createClient();
  const cols = "id,type,amount,due_date,paid_date,party_id,description";
  const [pendRes, ofRes] = await Promise.all([
    supabase.from("movements").select(cols).eq("status", "pendente").limit(TETO_LINHAS),
    supabase.from("movements").select(cols).eq("status", "pago").like("reference_code", "pluggy:%").limit(TETO_LINHAS),
  ]);
  if (pendRes.error) throw pendRes.error;
  if (ofRes.error) throw ofRes.error;
  const pend = (pendRes.data ?? []) as MovRow[];
  const ofs = (ofRes.data ?? []) as MovRow[];

  const usados = new Set<string>();
  const matches: MatchConc[] = [];
  for (const o of ofs) {
    const dataOf = o.paid_date ?? o.due_date;
    let best: { p: MovRow; conf: number } | null = null;
    for (const p of pend) {
      if (usados.has(p.id) || p.type !== o.type) continue;
      const dif = Math.abs(p.amount - Math.abs(o.amount));
      const valorExato = dif <= 0.01;
      const valorProx = p.amount > 0 && dif / p.amount <= 0.02;
      if (!valorExato && !valorProx) continue;
      const dd = diasEntre(dataOf, p.due_date);
      if (dd > 7) continue;
      const partyMatch = !!(o.party_id && p.party_id && o.party_id === p.party_id);
      const conf = (valorExato ? 50 : 35) + (dd === 0 ? 30 : dd <= 2 ? 22 : dd <= 5 ? 12 : 5) + (partyMatch ? 20 : 0);
      if (!best || conf > best.conf) best = { p, conf };
    }
    if (best) {
      usados.add(best.p.id);
      matches.push({
        ofId: o.id, ofDesc: o.description ?? "Open Finance", ofData: dataOf,
        pendId: best.p.id, pendDesc: best.p.description ?? "Título", dueDate: best.p.due_date,
        tipo: o.type, amount: Math.abs(o.amount), confianca: Math.min(100, best.conf),
      });
    }
  }
  matches.sort((a, b) => b.confianca - a.confianca);
  return { matches, pendentesSemMatch: pend.length - usados.size, ofSemMatch: ofs.length - matches.length };
}

/** Concilia um par: o movimento do banco (OF) herda a classificação do título e
 *  o título previsto é cancelado (Lixeira). Não duplica nem re-cria no próximo sync
 *  (o movimento OF segue vinculado à bank_transaction pelo reference_code). */
export async function conciliar(pendId: string, ofId: string): Promise<void> {
  if (isDemo) return;
  const supabase = createClient();
  const { data: pend } = await supabase.from("movements").select("party_id,category_id,cost_center_id,description").eq("id", pendId).maybeSingle();
  if (pend) {
    const patch: Record<string, unknown> = {};
    if (pend.party_id) patch.party_id = pend.party_id;
    if (pend.category_id) patch.category_id = pend.category_id;
    if (pend.cost_center_id) patch.cost_center_id = pend.cost_center_id;
    if (pend.description) patch.description = pend.description;
    if (Object.keys(patch).length) await supabase.from("movements").update(patch).eq("id", ofId);
  }
  const { error } = await supabase.from("movements").update({ status: "cancelado" }).eq("id", pendId);
  if (error) throw error;
}
