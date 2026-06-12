/**
 * Reembolsos — caso especializado do funil PAGAR. NÃO reinventa: reusa o motor
 * de alçada (`aprovacoes.ts`), a execução (Central, via `movement` de saída) e o
 * OCR (`lerDocumento`). Específico: beneficiário é colaborador + comprovante por
 * item. Cada item vira uma linha de despesa (categoria própria) na DRE.
 * Store local (demo-safe); persistência completa é roadmap.
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import { isoDay } from "@/lib/aggregations";
import { appendImported } from "@/lib/imported";
import { criarSolicitacao, listSolicitacoes } from "@/lib/aprovacoes";
import type { Movement } from "@/lib/types";

export interface ItemReembolso { descricao: string; valor: number; data: string; categoria: string }
export type StatusReembolso = "em_aprovacao" | "aprovado" | "rejeitado" | "a_pagar";

export interface Reembolso {
  id: string;
  colaborador: string;
  chavePix: string;
  itens: ItemReembolso[];
  total: number;
  justificativa?: string;
  status: StatusReembolso;
  solicitacaoId: string;
  movimentos: string[]; // ids dos movements gerados ao aprovar
  criadoEm: string;
}

const KEY = "a4p_reembolsos";
let cache: Reembolso[] | undefined;
function load(): Reembolso[] {
  if (cache) return cache;
  if (typeof window === "undefined") { cache = []; return cache; }
  try { cache = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { cache = []; }
  return cache!;
}
function save(list: Reembolso[]) {
  cache = list;
  if (typeof window !== "undefined") { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ } }
}

export function listReembolsos(): Reembolso[] {
  return [...load()].sort((a, b) => (b.criadoEm < a.criadoEm ? -1 : 1));
}

export interface NovoReembolso {
  colaborador: string; chavePix: string; itens: ItemReembolso[]; justificativa?: string;
}

/** Passo 1+2: cria o reembolso e o roteia pelo motor de alçada. */
export function solicitarReembolso(n: NovoReembolso): Reembolso {
  const total = n.itens.reduce((s, it) => s + it.valor, 0);
  const id = `reemb-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
  const sol = criarSolicitacao({
    objetoRef: id, tipo: "reembolso", beneficiario: n.colaborador, valor: total,
    categoria: n.itens[0]?.categoria, justificativa: n.justificativa, solicitante: n.colaborador,
  });
  const r: Reembolso = {
    id, colaborador: n.colaborador, chavePix: n.chavePix, itens: n.itens, total,
    justificativa: n.justificativa,
    status: sol.statusFinal === "aprovada" ? "aprovado" : "em_aprovacao",
    solicitacaoId: sol.id, movimentos: [], criadoEm: new Date().toISOString(),
  };
  save([r, ...load()]);
  return r;
}

/**
 * Sincroniza com o motor de alçada: quando a solicitação fica aprovada, gera os
 * `movements` de saída (1 por item → categoria certa na DRE) e marca `a_pagar`.
 * Chamado pela tela após decisões de aprovação.
 */
export async function sincronizarReembolsos(): Promise<number> {
  const sols = listSolicitacoes();
  const statusDe = new Map(sols.map((s) => [s.id, s.statusFinal]));
  let gerados = 0;
  const list = load();
  for (const r of list) {
    const st = statusDe.get(r.solicitacaoId);
    if (st === "rejeitada" && r.status !== "rejeitado") { r.status = "rejeitado"; continue; }
    if ((st === "aprovada") && r.status !== "a_pagar" && !r.movimentos.length) {
      r.movimentos = await gerarPagamento(r);
      r.status = "a_pagar";
      gerados++;
    } else if (st === "aprovada" && r.status === "em_aprovacao") {
      r.status = "aprovado";
    }
  }
  save([...list]);
  return gerados;
}

/** Passo 3: cada item vira um movement de saída (party = colaborador). */
async function gerarPagamento(r: Reembolso): Promise<string[]> {
  const hoje = isoDay(new Date());
  const ids: string[] = [];
  if (isDemo) {
    r.itens.forEach((it, i) => {
      const id = `${r.id}-mv${i}`;
      const movement: Movement = {
        id, account_id: "", type: "saida", status: "pendente",
        category: it.categoria, amount: it.valor, party_id: `colab:${r.colaborador}`,
        due_date: hoje, paid_date: null, reconciled: false,
        description: `Reembolso · ${r.colaborador} · ${it.descricao}`,
      } as Movement;
      appendImported({ movement });
      ids.push(id);
    });
    return ids;
  }
  // Live: cria os movements no Supabase (best-effort, sem criar party aqui).
  const supabase = createClient();
  const { data: accs } = await supabase.from("financial_accounts").select("id").limit(1);
  const accId = (accs as { id: string }[] | null)?.[0]?.id;
  if (!accId) return ids;
  const rows = r.itens.map((it) => ({
    account_id: accId, type: "saida", status: "pendente", category: it.categoria,
    amount: it.valor, due_date: hoje, paid_date: null, reconciled: false,
    description: `Reembolso · ${r.colaborador} · ${it.descricao}`,
  }));
  const { data } = await supabase.from("movements").insert(rows).select("id");
  for (const row of (data ?? []) as { id: string }[]) ids.push(row.id);
  return ids;
}

export function clearReembolsos(): void { save([]); }
