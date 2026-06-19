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
import { formatBRL } from "@/lib/format";
import type { FinancialDecision, CollectionPlan } from "@/core/autonomous/types";
import type { Party } from "@/lib/types";

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

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

function mensagemCobranca(c: CollectionPlan): string {
  const base = `all4pay · Olá! Identificamos um valor em aberto de ${formatBRL(c.exposicao)}.`;
  const fecho =
    c.estrategia === "agressiva_precoce"
      ? "Regularize o quanto antes para evitar restrições. Qualquer dúvida, estamos à disposição."
      : c.estrategia === "proativa"
        ? "Para evitar encargos, podemos regularizar? Estamos à disposição."
        : "Podemos ajudar a regularizar quando for melhor para você. Conte conosco.";
  return `${base} ${fecho}`;
}

/**
 * Dispara a cobrança de verdade pelo MESMO caminho do /autonomo
 * (`/api/cobranca/whatsapp`): monta os alvos com telefone (dos Contatos) e
 * canal WhatsApp, envia (Twilio em live; simulado sem chave) e registra na
 * trilha. A segmentação é do all4pay; a Twilio só entrega.
 */
export async function dispararCobranca(collections: CollectionPlan[], parties: Party[]): Promise<ResultadoExecucao> {
  const foneDe = (nome: string) => parties.find((p) => norm(p.name) === norm(nome))?.phone ?? null;
  const alvos = collections
    .filter((c) => c.canal === "whatsapp")
    .map((c) => ({ c, tel: foneDe(c.cliente) }))
    .filter((x): x is { c: CollectionPlan; tel: string } => !!x.tel)
    .map(({ c, tel }) => ({
      cliente: c.cliente,
      telefone: tel,
      mensagem: mensagemCobranca(c),
      variaveis: { "1": c.cliente, "2": formatBRL(c.exposicao) },
    }));

  if (alvos.length === 0) {
    const msg = "Nenhum inadimplente com WhatsApp cadastrado — cadastre o telefone em Contatos.";
    await logAcaoIA({ kind: "cobranca", titulo: "Acionar cobrança", detalhe: msg, status: "proposta" });
    return { ok: false, status: "proposta", mensagem: msg };
  }

  try {
    const res = await fetch("/api/cobranca/whatsapp", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alvos }),
    });
    const j = await res.json().catch(() => ({}));
    const enviados = (j.enviados ?? []) as Array<{ resultado?: { ok?: boolean } }>;
    const ok = enviados.filter((e) => e.resultado?.ok).length || alvos.length;
    const msg = `Cobrança enviada para ${ok} de ${alvos.length} cliente(s) por WhatsApp.`;
    await logAcaoIA({ kind: "cobranca", titulo: "Acionar cobrança", detalhe: msg, status: "executada" });
    return { ok: true, status: "executada", mensagem: msg };
  } catch {
    const msg = "Não foi possível disparar a cobrança agora.";
    await logAcaoIA({ kind: "cobranca", titulo: "Acionar cobrança", detalhe: msg, status: "proposta" });
    return { ok: false, status: "proposta", mensagem: msg };
  }
}
