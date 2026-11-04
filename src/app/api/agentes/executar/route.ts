import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { isDemo } from "@/lib/demo";
import { agentesLigados } from "@/core/agentes/ligado";
import { hojeEm } from "@/core/automacoes";
import { provedorReal } from "@/core/financial-os/notifications.server";
import { registroSupabase } from "@/lib/automacoes-registro";
import { executarAprovada } from "@/lib/agentes-servidor";

/**
 * EXECUTAR NA HORA a proposta que a pessoa acabou de aprovar.
 *
 * ⚠️ Esta rota não decide nada. Quem aprova é a função `agente_decidir`, que
 * confere a permissão NA EMPRESA DA PROPOSTA. Aqui só se antecipa o envio do
 * que JÁ está aprovado (o runner diário faria o mesmo na próxima execução):
 *   1. sessão;
 *   2. a proposta é lida pela RLS da sessão (só a da empresa ABERTA);
 *   3. só a APROVADA segue; pendente, recusada ou terminada voltam sem envio;
 *   4. o envio refaz a mensagem de HOJE e passa pelo `despachar` (a reserva
 *      em `automacao_envios` impede enviar duas vezes).
 * Atrás do interruptor `AGENTES=ligado`.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { id?: unknown };
  const id = typeof body.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null;
  if (!id) return NextResponse.json({ ok: false, motivo: "Proposta inválida." }, { status: 400 });
  if (isDemo) return NextResponse.json({ ok: true, estado: "aprovada", simulado: true, motivo: "Na demonstração nada é enviado." });
  if (!agentesLigados(process.env)) return NextResponse.json({ ok: false, motivo: "Os agentes ainda não estão liberados na plataforma." }, { status: 409 });

  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, motivo: "Entre na sua conta." }, { status: 401 });

  const { data: p, error } = await supabase.from("agente_propostas").select("id,org_id,estado").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ ok: false, motivo: error.message }, { status: 500 });
  if (!p) return NextResponse.json({ ok: false, motivo: "Proposta não encontrada nesta empresa." }, { status: 404 });
  const linha = p as { id: string; org_id: string; estado: string };
  if (linha.estado !== "aprovada") return NextResponse.json({ ok: true, estado: linha.estado });

  const admin = createAdmin();
  if (!admin) return NextResponse.json({ ok: false, motivo: "O envio fica para a execução diária: chave de serviço ausente." }, { status: 503 });
  try {
    const r = await executarAprovada(admin, linha.org_id, linha.id, hojeEm(new Date()), new URL(req.url).origin,
      { registro: registroSupabase(admin), provedor: provedorReal() });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, motivo: e instanceof Error ? e.message : "falha ao executar" }, { status: 500 });
  }
}
