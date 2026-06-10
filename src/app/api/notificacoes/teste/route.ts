import { NextResponse } from "next/server";
import { testarWhatsapp, statusNotificacoes } from "@/core/financial-os/notifications.server";

/**
 * Teste manual de WhatsApp — valida o Twilio na hora, sem depender de
 * eventos/cron. Server-side (chaves ficam no servidor).
 *
 *   GET  /api/notificacoes/teste        → envia para ALERTS_WHATSAPP_TO
 *   POST /api/notificacoes/teste { to, mensagem }
 *
 * Proteção: se CRON_SECRET estiver definido, exige
 * `Authorization: Bearer <CRON_SECRET>`. Sem CRON_SECRET, o endpoint só
 * envia para ALERTS_WHATSAPP_TO (ignora `to`) — evita relay aberto.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function autorizado(req: Request): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return true; // sem segredo: liberado, mas trava o destino (ver abaixo)
  return req.headers.get("authorization") === `Bearer ${segredo}`;
}

async function executar(to?: string, mensagem?: string) {
  // Sem CRON_SECRET, força o destino padrão (não aceita número arbitrário).
  const destino = process.env.CRON_SECRET ? to : undefined;
  const resultado = await testarWhatsapp(destino, mensagem);
  return NextResponse.json({ ok: resultado.ok, provedores: statusNotificacoes(), resultado });
}

export async function GET(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ ok: false, erro: "não autorizado" }, { status: 401 });
  return executar();
}

export async function POST(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ ok: false, erro: "não autorizado" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const to = typeof body?.to === "string" ? body.to : undefined;
  const mensagem = typeof body?.mensagem === "string" ? body.mensagem : undefined;
  return executar(to, mensagem);
}
