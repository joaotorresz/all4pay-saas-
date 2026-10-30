/**
 * A ENTRADA do WhatsApp — o que a Twilio entrega quando alguém responde ao
 * número da plataforma. SERVER-ONLY. Uma porta só, servida por duas rotas:
 * `/api/whatsapp/entrada` (a nova) e `/api/whatsapp/aprovacao` (o endereço
 * que já pode estar configurado na Twilio). O número é UM, e a Twilio só tem
 * um endereço de entrada por número.
 *
 * ⚠️ A ordem é a regra, e cada portão vem ANTES de qualquer chamada ao banco:
 *   1. existe `TWILIO_AUTH_TOKEN` para conferir a assinatura;
 *   2. a assinatura `X-Twilio-Signature` CONFERE — sem ela, qualquer pessoa na
 *      internet calaria o telefone de outra com um POST;
 *   3. SAIR / VOLTAR — SEMPRE, mesmo com a aprovação desligada: parar de
 *      receber não pode depender de uma funcionalidade estar ligada;
 *   4. a aprovação por WhatsApp, só com `WHATSAPP_APROVACAO=ligado`;
 *   5. a Quattro AI, só com `WHATSAPP_IA=ligado` e só para o número
 *      CONFIRMADO de alguém (`lib/whatsapp-ia`) — só leitura;
 *   6. o resto ganha a resposta padrão (que ensina o SAIR).
 *
 * ⚠️ Quem decide é o banco (`whatsapp_registrar_saida`,
 * `responder_aprovacao_whatsapp`), com a chave de serviço, a única que as
 * executa.
 */
import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase/admin";
import { assinaturaTwilioValida } from "@/lib/twilio-assinatura";
import { AJUDA_FORMATO, lerResposta, telefoneDoRemetente } from "@/core/aprovacao-whatsapp";
import { lerPedidoDeSaida, RESPOSTA_PADRAO, RESPOSTA_SAIR, RESPOSTA_VOLTAR } from "@/core/whatsapp/saida";
import { iaWhatsappLigada } from "@/core/whatsapp/numero";
import { RESPOSTA_FALHA } from "@/core/whatsapp/conversa";
import { responderIaWhatsapp } from "@/lib/whatsapp-ia";

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

export async function receberWhatsapp(req: Request): Promise<Response> {
  // 1. Sem o token não há como conferir quem mandou.
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) {
    return NextResponse.json({ motivo: "assinatura da Twilio não configurada" }, { status: 503 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ motivo: "corpo inválido" }, { status: 400 });
  const params: Record<string, string> = {};
  form.forEach((v, k) => { if (typeof v === "string") params[k] = v; });

  // 2. A assinatura confere — ANTES de qualquer chamada ao banco.
  if (!assinaturaTwilioValida(urlPublica(req), params, req.headers.get("x-twilio-signature"), token)) {
    return NextResponse.json({ motivo: "assinatura inválida" }, { status: 403 });
  }

  const corpo = params.Body ?? "";
  const telefone = telefoneDoRemetente(params.From ?? "");
  const admin = createAdmin();

  // 3. SAIR / VOLTAR — sempre.
  const pedido = lerPedidoDeSaida(corpo);
  if (pedido) {
    if (!admin || !telefone) {
      return NextResponse.json({ motivo: "servidor sem acesso ao banco" }, { status: 503 });
    }
    const { error } = await admin.rpc("whatsapp_registrar_saida", {
      p_telefone: telefone, p_acao: pedido, p_origem: corpo.slice(0, 200),
    });
    // ⚠️ 503 faz a Twilio tentar de novo: um SAIR perdido é alguém que pediu
    // para parar e continua recebendo.
    if (error) return NextResponse.json({ motivo: "não foi possível registrar agora" }, { status: 503 });
    return twiml(pedido === "sair" ? RESPOSTA_SAIR : RESPOSTA_VOLTAR);
  }

  // 4. A aprovação por WhatsApp, só ligada.
  if (process.env.WHATSAPP_APROVACAO === "ligado") {
    const lida = lerResposta(corpo);
    if (lida) {
      if (!admin) return NextResponse.json({ motivo: "servidor sem acesso ao banco" }, { status: 503 });
      const { data, error } = await admin.rpc("responder_aprovacao_whatsapp", {
        p_telefone: telefone, p_codigo: lida.codigo, p_decisao: lida.decisao,
      });
      if (error) return twiml("Não foi possível registrar a resposta agora. Tente novamente em alguns minutos.");
      const r = (data ?? {}) as { ok?: boolean; decisao?: string; motivo?: string };
      if (r.ok && r.decisao === "nao") return twiml("Recusa registrada. O título continua previsto e não foi aprovado.");
      if (r.ok) return twiml("Aprovação registrada. O título foi confirmado.");
      return twiml(`A aprovação não foi registrada: ${r.motivo ?? "motivo não informado"}`);
    }
    // Parece uma tentativa de aprovar com o formato errado: ensina o formato.
    if (/^\s*(sim|n[aã]o)\b/i.test(corpo)) return twiml(AJUDA_FORMATO);
  }

  // 5. A Quattro AI, só para o número confirmado de alguém.
  if (iaWhatsappLigada() && admin && telefone) {
    try {
      const resposta = await responderIaWhatsapp(admin, telefone, corpo);
      if (resposta) return twiml(resposta);
    } catch (e) {
      // ⚠️ A falha NÃO vira resposta padrão: quem tem o número confirmado
      // leria "não é atendido por pessoas" e concluiria que a IA não existe.
      console.error("whatsapp-ia", e instanceof Error ? e.message : e);
      return twiml(RESPOSTA_FALHA);
    }
  }

  // 6. O resto.
  return twiml(RESPOSTA_PADRAO);
}
