import { NextResponse } from "next/server";
import { recusaDeCron } from "@/lib/cron-auth";
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
  // ⚠️ A4P-078: a mesma regra das outras rotas de cron, da MESMA fonte. A
  // versão anterior devolvia `true` sem segredo e se apoiava no anti-relay (o
  // destino travado em ALERTS_WHATSAPP_TO) como única defesa — mas isso não
  // impede terceiro nenhum de DISPARAR mensagem e queimar quota. Ausência de
  // configuração não pode virar permissão.
  return recusaDeCron(req) === null;
}

async function executar(to?: string, mensagem?: string) {
  // ⚠️ O anti-relay daqui virou INALCANÇÁVEL com o A4P-078 consertado: sem
  // `CRON_SECRET` a rota recusa antes de chegar neste ponto, então quem chega
  // aqui já provou a credencial. Manter o ternário deixaria um ramo morto que a
  // próxima leitura interpretaria como defesa ainda ativa — e defesa que não
  // roda é pior que defesa nenhuma, porque conta como uma.
  const destino = to;
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
