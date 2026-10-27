import { NextResponse, type NextRequest } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import {
  COOKIE_GOOGLE, PRAZO_PEDIDO_S, ROTA_GOOGLE, enderecoDoGoogle, voltaDoGoogle, type PedidoGoogle,
} from "@/core/google";

/**
 * IDA DO "ENTRAR COM GOOGLE" PELO NOSSO DOMÍNIO.
 *
 *   GET /api/auth/google/inicio
 *
 * Gera o estado, o nonce e a prova PKCE, guarda os três num cookie só desta
 * rota e manda ao Google com a volta em `ROTA_GOOGLE` no MESMO domínio da
 * página. Por que existe: ver `core/google` ("a autorização volta ao nosso
 * domínio").
 *
 * ⚠️ O Google recebe o HASH do nonce; o nonce cru fica no cookie e vai ao
 * Supabase na volta, que o confere contra o `id_token` (é o que impede um
 * `id_token` de outro login de ser reaproveitado aqui).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const aleatorio = () => randomBytes(32).toString("base64url");

export async function GET(req: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error("[falha·acesso] acesso.google_inicio: NEXT_PUBLIC_GOOGLE_CLIENT_ID ou GOOGLE_CLIENT_SECRET ausente");
    return new NextResponse(null, { status: 303, headers: { location: "/login?google=falha" } });
  }

  const pedido: PedidoGoogle = { estado: aleatorio(), nonce: aleatorio(), verificador: aleatorio() };
  const destino = enderecoDoGoogle({
    clientId,
    volta: voltaDoGoogle(req.nextUrl.origin),
    estado: pedido.estado,
    nonceHash: createHash("sha256").update(pedido.nonce).digest("hex"),
    desafio: createHash("sha256").update(pedido.verificador).digest("base64url"),
  });

  const res = new NextResponse(null, { status: 303, headers: { location: destino } });
  res.cookies.set(COOKIE_GOOGLE, JSON.stringify(pedido), {
    httpOnly: true,
    secure: req.nextUrl.protocol === "https:",
    // "lax": o cookie precisa viajar na volta do Google, que é uma navegação de topo.
    sameSite: "lax",
    path: ROTA_GOOGLE,
    maxAge: PRAZO_PEDIDO_S,
  });
  return res;
}
