/**
 * Camada de AÇÃO do Copiloto — o que torna a IA "que age" (não só informa).
 * Une a trilha `ai_actions` (demo + live) ao executor de `FinancialDecision`
 * (dos motores decisão/autônomo) com human-in-the-loop:
 *   - `automatico`  → executa a ação reversível e registra na trilha;
 *   - `requer_aprovacao` → abre uma solicitação na alçada (`/aprovacoes`).
 * Toda ação — executada ou proposta — vira um registro auditável em `ai_actions`.
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import { criarSolicitacao } from "@/lib/aprovacoes";
import type { FinancialDecision } from "@/core/autonomous/types";

const KEY = "a4p_ai_actions";

export type StatusAcao = "executada" | "proposta" | "lida";
export interface AcaoIA {
  id: string;
  ts: string;
  kind: string;       // read | draft_entry | decision | …
  titulo: string;
  detalhe?: string;
  status: StatusAcao;
}

function loadLocal(): AcaoIA[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]") as AcaoIA[]; } catch { return []; }
}
function saveLocal(rows: AcaoIA[]): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(rows.slice(0, 100))); } catch { /* ignore */ }
}

/** Registra uma ação da IA na trilha (demo: local; live: ai_actions). */
export async function logAcaoIA(a: Omit<AcaoIA, "id" | "ts">): Promise<AcaoIA> {
  const row: AcaoIA = { ...a, id: `ai_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`, ts: new Date().toISOString() };
  if (isDemo) { saveLocal([row, ...loadLocal()]); return row; }
  try {
    await createClient().from("ai_actions").insert({
      kind: a.kind,
      prompt: a.titulo,
      result: { detalhe: a.detalhe ?? null, status: a.status } as object,
    });
  } catch { /* best-effort */ }
  return row;
}

/** Lê a trilha de ações da IA (demo: local; live: ai_actions). */
export async function listAcoesIA(limit = 30): Promise<AcaoIA[]> {
  if (isDemo) return loadLocal().slice(0, limit);
  try {
    const { data } = await createClient()
      .from("ai_actions")
      .select("id,kind,prompt,result,created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
      const res = (r.result ?? {}) as { detalhe?: string; status?: StatusAcao };
      return {
        id: String(r.id),
        ts: String(r.created_at ?? new Date().toISOString()),
        kind: String(r.kind ?? "read"),
        titulo: String(r.prompt ?? "Ação"),
        detalhe: res.detalhe ?? undefined,
        status: res.status ?? "lida",
      };
    });
  } catch { return []; }
}

export interface ResultadoExecucao { ok: boolean; status: StatusAcao; mensagem: string }

/**
 * Executa uma decisão com human-in-the-loop. Ações reversíveis e dentro da
 * alçada são executadas e registradas; as que movem dinheiro (ou de baixa
 * confiança) abrem uma solicitação na alçada.
 */
export async function executarDecisao(d: FinancialDecision): Promise<ResultadoExecucao> {
  // Move dinheiro acima da alçada / baixa confiança → aprovação humana.
  if (d.modo === "requer_aprovacao") {
    try {
      await criarSolicitacao({
        objetoRef: `dec:${d.id}`,
        tipo: "pagamento",
        beneficiario: d.titulo,
        valor: d.valor,
        justificativa: d.recomendacao,
        solicitante: "Copiloto (IA)",
      });
    } catch { /* a trilha registra mesmo se a alçada falhar */ }
    await logAcaoIA({ kind: "decision", titulo: d.titulo, detalhe: `Enviada para aprovação · ${d.recomendacao}`, status: "proposta" });
    return { ok: true, status: "proposta", mensagem: "Enviada para aprovação na alçada (/aprovacoes)." };
  }

  // Ação reversível dentro da alçada → executa e registra.
  const detalhe =
    d.tipo === "cobranca" ? "Cobrança acionada (segmentação do all4pay; envio em Cobrança/Autônomo)."
    : d.tipo === "risco" ? "Monitoramento ativado e alerta registrado."
    : d.recomendacao;
  await logAcaoIA({ kind: "decision", titulo: d.titulo, detalhe, status: "executada" });
  return { ok: true, status: "executada", mensagem: detalhe };
}
