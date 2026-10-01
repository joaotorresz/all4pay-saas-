import { NextResponse } from "next/server";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createAdmin } from "@/lib/supabase/admin";
import { tokenDoDestinatario, anexosAceitos } from "@/core/caixa-entrada/email";

/**
 * Webhook de E-MAIL RECEBIDO da caixa de entrada de contas a pagar.
 *
 *   POST /api/caixa-email/entrada            (formato "inbound" do Postmark)
 *
 * ⚠️ **DESLIGADA POR PADRÃO.** Sem `CAIXA_EMAIL=ligado` responde 503 e não toca
 * em nada. Ligar exige, nesta ordem: o provedor configurado com o domínio, o
 * `CAIXA_EMAIL_SEGREDO` dos dois lados e a migration `20261001150000` aplicada.
 *
 * ⚠️ **NÃO ESCREVE CONTA.** A mensagem entra na fila da caixa de entrada
 * (`caixa_email_mensagens`); quem a transforma em conta a pagar é uma pessoa,
 * pelo formulário de sempre. Nada aqui chega perto de `movements`.
 *
 * A ordem das portas é a regra, e há guarda cobrando: interruptor → segredo →
 * só então o banco. Uma rota que consulta o banco antes de conferir quem chama
 * vira, no mínimo, um oráculo de tokens válidos.
 *
 * Desenho do anexo: o id da mensagem nasce AQUI (`randomUUID`) e vai para a
 * RPC; a RPC resolve a empresa pelo token e devolve o caminho de cada anexo
 * (`<org>/<id>/<nome>`). Só então os arquivos sobem — com `upsert`, para que um
 * reenvio do provedor (o mesmo Message-ID, `duplicada`) regrave nos MESMOS
 * caminhos da mensagem que já existe, completando o que tiver falhado em vez de
 * duplicar. Falha de upload devolve 502: o provedor reenvia, e o reenvio é
 * idempotente.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "caixa-email";

interface AnexoPostmark { Name?: string; Content?: string; ContentType?: string; ContentLength?: number }
interface CorpoPostmark {
  From?: string; FromFull?: { Email?: string; Name?: string };
  To?: string; OriginalRecipient?: string;
  Subject?: string; TextBody?: string; MessageID?: string;
  Headers?: { Name?: string; Value?: string }[];
  Attachments?: AnexoPostmark[];
}

const resposta = (status: number, corpo: Record<string, unknown>) => NextResponse.json(corpo, { status });

/** Compara em tempo constante — os dois lados viram SHA-256 para terem o mesmo tamanho. */
function mesmoSegredo(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/** O segredo apresentado: senha do Basic (o Postmark manda `user:senha@` na URL) ou `?segredo=`. */
function segredoApresentado(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  if (/^basic\s+/i.test(auth)) {
    try {
      const dec = Buffer.from(auth.replace(/^basic\s+/i, ""), "base64").toString("utf8");
      const i = dec.indexOf(":");
      if (i >= 0) return dec.slice(i + 1);
    } catch {
      return null;
    }
  }
  try {
    return new URL(req.url).searchParams.get("segredo");
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  // 1. O INTERRUPTOR — antes de qualquer outra coisa.
  if (process.env.CAIXA_EMAIL !== "ligado") {
    return resposta(503, { ok: false, motivo: "A caixa de entrada por e-mail está desligada até a configuração do provedor." });
  }
  // 2. O SEGREDO — ausência de configuração NÃO vira permissão (A4P-078).
  const segredo = process.env.CAIXA_EMAIL_SEGREDO ?? "";
  if (!segredo) {
    return resposta(503, { ok: false, motivo: "Falta configurar o segredo do provedor de e-mail no servidor." });
  }
  const apresentado = segredoApresentado(req);
  if (!apresentado || !mesmoSegredo(apresentado, segredo)) {
    return resposta(401, { ok: false, motivo: "não autorizado" });
  }

  // 3. O ENVELOPE — de qual empresa é. Sem token, nem pergunta ao banco.
  const corpo = (await req.json().catch(() => null)) as CorpoPostmark | null;
  if (!corpo || typeof corpo !== "object") {
    return resposta(400, { ok: false, motivo: "Corpo da requisição não é JSON." });
  }
  const token = tokenDoDestinatario(corpo.To) ?? tokenDoDestinatario(corpo.OriginalRecipient);
  // ⚠️ 403 e não 404: o Postmark PARA de reenviar num 403. Um e-mail para um
  // endereço que não existe não passa a existir na décima tentativa.
  if (!token) return resposta(403, { ok: false, motivo: "destinatário não reconhecido" });

  // 4. Os anexos — o que não entra volta com o motivo, nunca some.
  const brutos = (corpo.Attachments ?? []).map((a) => ({
    nome: String(a.Name ?? "anexo"),
    tipo: String(a.ContentType ?? "application/octet-stream"),
    // O tamanho é o do conteúdo DECODIFICADO; o declarado pode mentir.
    tamanho: typeof a.Content === "string" ? Buffer.byteLength(a.Content, "base64") : Number(a.ContentLength ?? 0),
    conteudo: typeof a.Content === "string" ? a.Content : "",
  }));
  const { aceitos, recusados } = anexosAceitos(brutos);

  // 5. Só agora o banco.
  const admin = createAdmin();
  if (!admin) {
    return resposta(503, { ok: false, motivo: "O servidor está sem a chave de serviço do banco." });
  }
  const remetente = corpo.FromFull?.Email
    ? (corpo.FromFull.Name ? `${corpo.FromFull.Name} <${corpo.FromFull.Email}>` : corpo.FromFull.Email)
    : (corpo.From ?? null);
  const mensagemId = corpo.MessageID
    ?? corpo.Headers?.find((h) => (h.Name ?? "").toLowerCase() === "message-id")?.Value
    ?? null;

  const { data, error } = await admin.rpc("registrar_email_caixa", {
    p_token: token,
    p_remetente: remetente,
    p_assunto: corpo.Subject ?? null,
    p_texto: (corpo.TextBody ?? "").slice(0, 20000),
    p_anexos: aceitos.map((a) => ({ nome: a.nome, tipo: a.tipo, tamanho: a.tamanho })),
    p_mensagem_id: mensagemId,
    p_id: randomUUID(),
  });
  if (error) {
    if (/destinatário não reconhecido/.test(error.message)) {
      return resposta(403, { ok: false, motivo: "destinatário não reconhecido" });
    }
    console.error("[caixa-email] o banco recusou a mensagem:", error.message);
    return resposta(500, { ok: false, motivo: "O banco recusou a mensagem." });
  }

  const r = data as { id: string; duplicada: boolean; anexos: { nome: string; caminho: string }[] };
  const falhas: string[] = [];
  for (let i = 0; i < aceitos.length; i++) {
    const caminho = r.anexos?.[i]?.caminho;
    if (!caminho) { falhas.push(aceitos[i].nome); continue; }
    const { error: e } = await admin.storage.from(BUCKET).upload(
      caminho, Buffer.from(aceitos[i].conteudo, "base64"),
      { contentType: aceitos[i].tipo, upsert: true },
    );
    if (e) falhas.push(aceitos[i].nome);
  }

  const recusadosResumo = recusados.map((a) => ({ nome: a.nome, motivo: a.motivo }));
  if (falhas.length > 0) {
    // 502: o provedor reenvia, e o reenvio regrava nos mesmos caminhos.
    return resposta(502, { ok: false, id: r.id, duplicada: r.duplicada, recusados: recusadosResumo, anexosFalharam: falhas });
  }
  return resposta(200, { ok: true, duplicada: r.duplicada, recusados: recusadosResumo });
}
