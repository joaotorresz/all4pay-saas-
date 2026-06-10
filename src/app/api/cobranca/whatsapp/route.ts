import { NextResponse } from "next/server";
import { dispararCobrancas, statusNotificacoes, type AlvoCobranca } from "@/core/financial-os/notifications.server";

/**
 * Disparo de cobrança por cliente via WhatsApp (server-side; chaves Twilio
 * ficam no servidor). Recebe os alvos já montados pelo app (cliente +
 * telefone + mensagem) — a segmentação/decisão é do all4pay, a Twilio só entrega.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const lista: unknown[] = Array.isArray(body?.alvos) ? body.alvos : [];
  const alvos: AlvoCobranca[] = lista
    .slice(0, 200)
    .filter((a): a is { cliente?: string; telefone?: string; mensagem?: string } => !!a && typeof a === "object")
    .filter((a) => typeof a.telefone === "string" && a.telefone.trim().length > 0 && typeof a.mensagem === "string")
    .map((a) => ({ cliente: String(a.cliente ?? "Cliente"), telefone: a.telefone!.trim(), mensagem: String(a.mensagem).slice(0, 400) }));

  const enviados = await dispararCobrancas(alvos);
  return NextResponse.json({
    ok: true,
    provedores: statusNotificacoes(),
    total: enviados.length,
    sucesso: enviados.filter((e) => e.resultado.ok).length,
    enviados,
  });
}
