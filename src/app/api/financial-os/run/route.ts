import { NextResponse } from "next/server";
import { runScheduledOS } from "@/lib/financial-os";
import { dispararNotificacoes, statusNotificacoes } from "@/core/financial-os/notifications.server";

export const runtime = "nodejs";

/**
 * Runner agendado do Sistema Operacional Financeiro.
 * Detecta eventos (saldo crítico, inadimplência) → motor de regras →
 * ações/notificações → ponte de risco → alertas executivos.
 *
 * Acionado por Vercel Cron (ver vercel.json) ou manualmente via GET.
 * Se `CRON_SECRET` estiver definido, exige `Authorization: Bearer <secret>`.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const trace = await runScheduledOS();
  // Envio REAL (server-side) das ações de WhatsApp/e-mail, quando configurado.
  const envios = await dispararNotificacoes(trace.execucoes);
  return NextResponse.json({
    ok: true,
    geradoEm: new Date().toISOString(),
    eventos: trace.eventos.length,
    acoesExecutadas: trace.execucoes.length,
    execucoes: trace.execucoes,
    alertasExecutivos: trace.alertasExecutivos,
    notificacoes: { provedores: statusNotificacoes(), enviados: envios },
  });
}
