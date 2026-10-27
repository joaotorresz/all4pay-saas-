import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createAdmin } from "@/lib/supabase/admin";
import { normalizarEvento } from "@/core/cadastro/jornada";

/**
 * O PASSO DO CADASTRO, registrado (etapa 1 do plano "documentos e funil").
 *
 *   POST /api/cadastro/jornada   { id, etapa, tipo?, nome?, whatsapp?, email? }
 *
 * ⚠️ **PÚBLICA, porque a conta ainda não existe** enquanto a pessoa conversa em
 * /criar-conta. Por isso ela:
 *   · só ESCREVE — responde 204 sem corpo, e nunca diz o que já está gravado
 *     (seria um oráculo de nomes e telefones de quem começou um cadastro);
 *   · aceita só os campos de `normalizarEvento` (nada de CPF, senha ou foto);
 *   · leva o HASH do IP, nunca o IP, para o teto de jornadas novas por origem
 *     que o banco aplica (`cadastro_jornada_registrar`).
 *
 * ⚠️ Falha aqui nunca derruba o cadastro: o cliente chama sem esperar, e um
 * erro vira 204 do mesmo jeito para quem chama — o rastro fica no log.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const vazio = () => new NextResponse(null, { status: 204 });

function hashDaOrigem(req: Request): string | null {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || req.headers.get("x-real-ip") || "";
  if (!ip) return null;
  const sal = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return createHash("sha256").update(`${sal}:${ip}`, "utf8").digest("hex").slice(0, 32);
}

export async function POST(req: Request) {
  let corpo: unknown;
  try {
    const bruto = await req.text();
    if (bruto.length > 2_000) return new NextResponse(null, { status: 413 });
    corpo = JSON.parse(bruto);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const ev = normalizarEvento(corpo);
  if (!ev) return new NextResponse(null, { status: 400 });

  const admin = createAdmin();
  if (!admin) return vazio();
  const { error } = await admin.rpc("cadastro_jornada_registrar", {
    p_id: ev.id,
    p_etapa: ev.etapa,
    p_tipo: ev.tipo ?? null,
    p_nome: ev.nome ?? null,
    p_whatsapp: ev.whatsapp ?? null,
    p_email: ev.email ?? null,
    p_ip_hash: hashDaOrigem(req),
  });
  if (error) console.error("[cadastro-jornada] registro recusado:", error.code, error.message);
  return vazio();
}
