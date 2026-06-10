import { NextResponse } from "next/server";
import { statusNotificacoes } from "@/core/financial-os/notifications.server";

/**
 * Status dos provedores de notificação (server-side). Só booleans — não
 * envia nada e não expõe segredos. Usado pela tela de Automações para
 * mostrar o modo atual (simulado / sandbox / template aprovado).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(statusNotificacoes());
}
