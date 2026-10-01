import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase/admin";
import { assinaturaTwilioValida } from "@/lib/twilio-assinatura";
import { AJUDA_FORMATO, lerResposta, telefoneDoRemetente } from "@/core/aprovacao-whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook da Twilio: a RESPOSTA do aprovador ("SIM ABC234" / "NÃO ABC234").
 *
 * ⚠️ A ordem é a regra, e cada portão vem ANTES de qualquer chamada ao banco:
 *   1. a funcionalidade está LIGADA (`WHATSAPP_APROVACAO=ligado`) — nasce desligada;
 *   2. existe `TWILIO_AUTH_TOKEN` para conferir a assinatura;
 *   3. a assinatura `X-Twilio-Signature` CONFERE — sem ela, qualquer pessoa na
 *      internet mandaria um POST com o telefone e o código de outro;
 *   4. só então a RPC, com a chave de serviço (a única que a executa).
 *
 * ⚠️ Quem DECIDE é o banco: `responder_aprovacao_whatsapp` faz o mesmo UPDATE
 * da Central, como o aprovador, e o gatilho `central_maquina` aplica
 * segregação, permissão e alçada. Esta rota só traduz a resposta em texto.
 */

const escaparXML = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const twiml = (texto: string): Response =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaparXML(texto)}</Message></Response>`, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });

/** A URL que a Twilio assinou: a pública, atrás do proxy da Vercel. */
function urlPublica(req: Request): string {
  const u = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || u.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host") || u.host;
  return `${proto}://${host}${u.pathname}${u.search}`;
}

export async function POST(req: Request) {
  // 1. Desligada por padrão.
  if (process.env.WHATSAPP_APROVACAO !== "ligado") {
    return NextResponse.json({ motivo: "aprovação por WhatsApp desligada" }, { status: 503 });
  }
  // 2. Sem o token não há como conferir quem mandou.
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) {
    return NextResponse.json({ motivo: "assinatura da Twilio não configurada" }, { status: 503 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ motivo: "corpo inválido" }, { status: 400 });
  const params: Record<string, string> = {};
  form.forEach((v, k) => { if (typeof v === "string") params[k] = v; });

  // 3. A assinatura confere — ANTES de qualquer chamada ao banco.
  if (!assinaturaTwilioValida(urlPublica(req), params, req.headers.get("x-twilio-signature"), token)) {
    return NextResponse.json({ motivo: "assinatura inválida" }, { status: 403 });
  }

  const lida = lerResposta(params.Body ?? "");
  if (!lida) return twiml(AJUDA_FORMATO);

  // 4. A RPC, com a chave de serviço.
  const admin = createAdmin();
  if (!admin) {
    return NextResponse.json({ motivo: "servidor sem acesso ao banco" }, { status: 503 });
  }
  const { data, error } = await admin.rpc("responder_aprovacao_whatsapp", {
    p_telefone: telefoneDoRemetente(params.From ?? ""),
    p_codigo: lida.codigo,
    p_decisao: lida.decisao,
  });
  if (error) {
    return twiml("Não foi possível registrar a resposta agora. Tente novamente em alguns minutos.");
  }
  const r = (data ?? {}) as { ok?: boolean; decisao?: string; motivo?: string };
  if (r.ok && r.decisao === "nao") return twiml("Recusa registrada. O título continua previsto e não foi aprovado.");
  if (r.ok) return twiml("Aprovação registrada. O título foi confirmado.");
  return twiml(`A aprovação não foi registrada: ${r.motivo ?? "motivo não informado"}`);
}
