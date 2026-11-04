import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { configDoFormulario } from "@/core/nfse/cadastro-fiscal";

/**
 * O CADASTRO FISCAL DO EMITENTE — só a plataforma grava (03/11/2026).
 *
 *   POST /api/admin/nfse-emitentes  { orgId, valores: { campo: texto } }
 *
 * Substitui o ajuste por SQL em `nfse_emitentes`. O formulário passa pela
 * MESMA `lerEmitentes` que o envio usa (`configDoFormulario`): campo fora de
 * forma é recusa, com o motivo na tela, nunca gravação silenciosa.
 *
 * Portões, nesta ordem: banco → sessão → `admin_exigir_acesso` (plataforma,
 * segundo fator, registro) → validação → só então a escrita, com a chave de
 * serviço (a tabela não tem concessão a `authenticated`). A trilha
 * (`auditar_escrita`) registra a mudança.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resposta = (status: number, corpo: Record<string, unknown>) =>
  NextResponse.json(corpo, { status, headers: { "cache-control": "no-store, max-age=0" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return resposta(404, { ok: false, motivo: "Indisponível sem o banco (demonstração)." });
  }
  const doChamador = createClient();
  const { data: auth } = await doChamador.auth.getUser();
  if (!auth?.user) return resposta(401, { ok: false, motivo: "não autenticado" });
  const { error: negado } = await doChamador.rpc("admin_exigir_acesso", { p_funcao: "admin_nfse_emitente", p_alvo: null });
  if (negado) return resposta(403, { ok: false, motivo: negado.message });

  let corpo: { orgId?: unknown; valores?: unknown };
  try { corpo = await req.json(); } catch { return resposta(400, { ok: false, motivo: "Pedido ilegível." }); }
  const orgId = typeof corpo.orgId === "string" ? corpo.orgId : "";
  if (!UUID.test(orgId)) return resposta(400, { ok: false, motivo: "Escolha a empresa." });
  const valores: Record<string, string> = {};
  if (corpo.valores && typeof corpo.valores === "object") {
    for (const [k, v] of Object.entries(corpo.valores as Record<string, unknown>)) if (typeof v === "string") valores[k] = v.slice(0, 200);
  }
  const lido = configDoFormulario(valores);
  if (!lido.ok) return resposta(422, { ok: false, problemas: lido.problemas });

  const admin = createAdmin();
  if (!admin) return resposta(503, { ok: false, motivo: "Banco indisponível." });
  const { error } = await admin.from("nfse_emitentes").upsert(
    { org_id: orgId, config: lido.config, atualizado_por: auth.user.email ?? auth.user.id, atualizado_em: new Date().toISOString() },
    { onConflict: "org_id" },
  );
  // A mensagem real do banco vai para a tela (regra 15).
  if (error) return resposta(500, { ok: false, motivo: error.message });
  return resposta(200, { ok: true, config: lido.config });
}
