import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cobrancaPinbankLiberada } from "@/lib/pinbank/api";

/**
 * O LINK DE PAGAMENTO de um título a receber (etapa 4, MVP).
 *
 *   POST /api/pinbank/checkout  { movementId }  → { ok, token }
 *
 * ⚠️ Cria como a PESSOA (`pinbank_checkout_link_criar`: empresa aberta, papel
 * de lançar, título a receber em aberto, ao menos uma cobrança EMITIDA). O
 * segundo pedido devolve o mesmo link. Nenhuma chamada à Pinbank sai daqui.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resposta = (status: number, corpo: Record<string, unknown>) =>
  NextResponse.json(corpo, { status, headers: { "cache-control": "no-store, max-age=0" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return resposta(404, { ok: false, codigo: "demonstracao", motivo: "Indisponível na demonstração." });
  }
  const s = createClient();
  const { data: auth } = await s.auth.getUser();
  if (!auth?.user) return resposta(401, { ok: false, codigo: "sem_sessao", motivo: "Sua sessão terminou. Entre de novo." });
  const corpo = (await req.json().catch(() => null)) as { movementId?: unknown } | null;
  const movementId = typeof corpo?.movementId === "string" ? corpo.movementId.trim() : "";
  if (!UUID.test(movementId)) return resposta(400, { ok: false, codigo: "pedido_invalido", motivo: "Título não informado." });
  if (!cobrancaPinbankLiberada().liberada) {
    return resposta(503, { ok: false, codigo: "indisponivel", motivo: "A cobrança pela conta Pinbank ainda não foi liberada pela Quattro." });
  }
  const { data, error } = await s.rpc("pinbank_checkout_link_criar", { p_movement: movementId });
  if (error || typeof data !== "string") {
    const m = /A4P-COBRANCA:\s*(.+)$/.exec(error?.message ?? "");
    return resposta(422, { ok: false, codigo: "recusado", motivo: m ? m[1].trim() : "Não foi possível criar o link agora." });
  }
  return resposta(200, { ok: true, token: data });
}
