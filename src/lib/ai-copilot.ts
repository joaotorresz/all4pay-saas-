/**
 * Camada de ação do Copiloto — e a fronteira, escrita, entre o que a IA
 * SUGERE e o que ela de fato FAZ.
 *
 * ⚠️ Esta fronteira não existia, e a interface ficava do lado errado dela. O
 * botão dizia "Executar", o resultado dizia "executada" e o histórico dizia
 * "Feita" — para uma função cujo corpo inteiro era escrever uma linha na
 * trilha. Ninguém foi cobrado, nenhum monitoramento foi ativado, nenhum
 * fornecedor foi renegociado. Um sistema financeiro que afirma ter agido sem
 * ter agido não é uma promessa exagerada: é um registro falso, e ele vai ser
 * lido no dia em que alguém perguntar por que a cobrança não chegou.
 *
 * Só DUAS coisas acontecem de verdade daqui, e as duas são verificáveis:
 *   - `requer_aprovacao` → abre uma solicitação na alçada (`/aprovacoes`);
 *   - cobrança → sai por `/api/cobranca/whatsapp` (Twilio; **simulada** sem
 *     chave, e a mensagem diz qual dos dois foi).
 * Todo o resto é SUGESTÃO REGISTRADA — e é assim que a trilha a nomeia.
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import { criarSolicitacao } from "@/lib/aprovacoes";
import { formatBRL } from "@/lib/format";
import type { FinancialDecision, CollectionPlan } from "@/core/autonomous/types";
import type { Party } from "@/lib/types";

const KEY = "a4p_ai_actions";

/**
 * ⚠️ `registrada` é o estado que faltava. Sem ele, tudo que a IA propunha
 * caía em "executada" por não haver terceira opção — e a trilha, que é a
 * prova de o que aconteceu, passava a afirmar o que não aconteceu.
 */
export type StatusAcao = "executada" | "registrada" | "proposta" | "lida";
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

  /*
   * ⚠️ AQUI NÃO SE EXECUTA NADA, e é por isso que a mensagem mudou.
   *
   * Este ramo escrevia "Monitoramento ativado e alerta registrado" e marcava a
   * ação como executada. Nenhum monitoramento é ativado por esta função — o
   * corpo dela é uma linha na trilha. A frase certa é a que descreve o que
   * aconteceu: a sugestão ficou registrada, com quem a viu e quando.
   *
   * A cobrança é a única que age de verdade, e ela NÃO passa por aqui: a tela
   * a manda para `dispararCobranca`, que sai pela Twilio.
   */
  await logAcaoIA({
    kind: "decision", titulo: d.titulo,
    detalhe: `Sugestão registrada · ${d.recomendacao}`,
    status: "registrada",
  });
  return {
    ok: true, status: "registrada",
    mensagem: "Sugestão registrada na trilha. Nenhuma ação foi executada.",
  };
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

/** Mensagens de cobrança adaptativas (por perfil) via IA; vazio = usa template. */
async function mensagensAdaptativas(collections: CollectionPlan[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (collections.length === 0) return out;
  try {
    const j = await fetch("/api/ai/cobranca", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ alvos: collections.map((c) => ({ cliente: c.cliente, exposicao: c.exposicao, estrategia: c.estrategia, tom: c.tom })) }),
    }).then((r) => r.json());
    if (j?.ok && Array.isArray(j.mensagens)) {
      for (const m of j.mensagens as Array<{ cliente: string; mensagem: string }>) {
        if (m?.cliente && m?.mensagem) out.set(m.cliente, m.mensagem);
      }
    }
  } catch { /* fallback: template */ }
  return out;
}

/**
 * Dispara a cobrança de verdade pelo MESMO caminho do /autonomo
 * (`/api/cobranca/whatsapp`): monta os alvos com telefone (dos Contatos) e
 * canal WhatsApp, envia (Twilio em live; simulado sem chave) e registra na
 * trilha. A segmentação é do all4pay; a Twilio só entrega.
 */
export async function dispararCobranca(collections: CollectionPlan[], parties: Party[]): Promise<ResultadoExecucao> {
  const foneDe = (nome: string) => parties.find((p) => norm(p.name) === norm(nome))?.phone ?? null;
  const enviaveis = collections.filter((c) => c.canal === "whatsapp" && foneDe(c.cliente));

  // Cobrança adaptativa: mensagem por perfil do cliente via IA (1 chamada);
  // fallback determinístico (template) por cliente quando não há chave/erro.
  const adaptadas = await mensagensAdaptativas(enviaveis);

  const alvos = enviaveis.map((c) => ({
    cliente: c.cliente,
    telefone: foneDe(c.cliente) as string,
    mensagem: adaptadas.get(c.cliente) ?? mensagemCobranca(c),
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
    /*
     * ⚠️ Era `enviados.filter(ok).length || alvos.length`. Com ZERO entregas o
     * `0 ||` caía no total e a tela dizia "enviada para 3 de 3" justamente no
     * caso em que nenhuma saiu — o relato mais falso possível é o que só mente
     * quando tudo deu errado.
     */
    const ok = enviados.filter((e) => e.resultado?.ok).length;
    // Sem chave da Twilio o envio é SIMULADO no servidor. Chamar isso de
    // "enviada" faria a pessoa parar de cobrar um cliente que nunca foi avisado.
    const real = !!(j?.provedores as { whatsapp?: boolean } | undefined)?.whatsapp;
    const msg = real
      ? `Cobrança enviada para ${ok} de ${alvos.length} cliente(s) por WhatsApp.`
      : `Simulação: ${alvos.length} cobrança(s) preparada(s), nenhuma enviada — o envio por WhatsApp não está configurado.`;
    await logAcaoIA({
      kind: "cobranca", titulo: "Acionar cobrança", detalhe: msg,
      status: real && ok > 0 ? "executada" : "registrada",
    });
    return { ok: real && ok > 0, status: real && ok > 0 ? "executada" : "registrada", mensagem: msg };
  } catch {
    const msg = "Não foi possível disparar a cobrança agora.";
    await logAcaoIA({ kind: "cobranca", titulo: "Acionar cobrança", detalhe: msg, status: "proposta" });
    return { ok: false, status: "proposta", mensagem: msg };
  }
}
