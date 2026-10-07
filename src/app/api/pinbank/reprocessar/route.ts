import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { processarEvento } from "@/lib/pinbank/processar";

/**
 * Reprocessar os eventos da maquininha Pinbank da empresa aberta.
 *
 *   POST /api/pinbank/reprocessar
 *
 * Para depois de ATIVAR a maquininha (os eventos que esperavam a segunda
 * chave), de regularizar a assinatura (os `bloqueado`) ou de corrigir a conta
 * do repasse (os `erro`).
 *
 * ⚠️ **A LISTA é pedida COMO A PESSOA** (`pinbank_eventos_para_reprocessar`, que
 * recusa quem não administra a empresa aberta e só devolve eventos DELA); só o
 * processamento usa a chave de serviço. Quem não pode, não recebe lista — e sem
 * lista não há o que processar. O processamento é idempotente pela versão da
 * transação: reprocessar duas vezes não lança duas vendas.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const s = createClient();
  const { data: ids, error } = await s.rpc("pinbank_eventos_para_reprocessar", { p_limite: 200 });
  if (error) {
    const proibido = /só quem administra/.test(error.message);
    return NextResponse.json({ ok: false, motivo: error.message }, { status: proibido ? 403 : 400 });
  }
  const admin = createAdmin();
  if (!admin) return NextResponse.json({ ok: false, motivo: "O servidor está sem a chave de serviço do banco." }, { status: 503 });

  const contagem: Record<string, number> = {};
  for (const id of (ids ?? []) as string[]) {
    const r = await processarEvento(admin, id);
    contagem[r.situacao] = (contagem[r.situacao] ?? 0) + 1;
  }
  return NextResponse.json({ ok: true, total: (ids ?? []).length, contagem });
}
