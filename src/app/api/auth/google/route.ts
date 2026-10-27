import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  COOKIE_GOOGLE, ROTA_GOOGLE, destinoDoGoogle, estadoConfere, lerPedidoGoogle, motivoDaFalhaGoogle,
  voltaDoGoogle, type MotivoGoogle,
} from "@/core/google";

/**
 * VOLTA DO "ENTRAR COM GOOGLE" — troca o código pela sessão.
 *
 *   GET /api/auth/google?code=…
 *
 * O botão do login (`entrarComGoogle`, lib/entrada) manda ao Google; o Google
 * devolve ao Auth; o Auth devolve para cá. Mesmo desenho da volta do link de
 * senha (`/api/auth/recuperar`): rota sob `/api` (pública no middleware, e só
 * rota grava cookie), destino FIXO e RELATIVO, falha como palavra da lista.
 *
 * ⚠️ **Conta nova vai ao cadastro, não à Home** (`destinoDoGoogle`). As
 * empresas são lidas COMO A PESSOA (RLS por vínculo), com a sessão que esta
 * rota acabou de abrir.
 *
 * ⚠️ **Duas idas, uma volta (27/10/2026).** Quem foi pelo NOSSO domínio
 * (`ROTA_GOOGLE_INICIO`) volta com `state` e com o cookie do pedido: a rota
 * confere o estado, troca o código pelo `id_token` com o segredo do cliente e
 * o entrega ao Supabase (`signInWithIdToken`). Quem foi pelo caminho do
 * Supabase volta só com `code`, trocado como antes. Os dois caem no MESMO
 * destino.
 *
 * ⚠️ **O segundo fator não é contornado.** O destino "/" passa pelo
 * middleware, que manda quem tem aplicativo autenticador ao passo do código.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const para = (caminho: string) => new NextResponse(null, { status: 303, headers: { location: caminho } });
  const falhou = (motivo: MotivoGoogle) => para(`/login?google=${motivo}`);

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return para("/login");

  const code = url.searchParams.get("code");
  const estado = url.searchParams.get("state");
  const jar = cookies();
  const pedido = lerPedidoGoogle(jar.get(COOKIE_GOOGLE)?.value);
  // O pedido vale UMA volta: some agora, deu certo ou não.
  if (jar.get(COOKIE_GOOGLE)) jar.set(COOKIE_GOOGLE, "", { path: ROTA_GOOGLE, maxAge: 0 });

  if (!code) {
    // O Google (ou o Auth) devolve o erro na URL: "access_denied" é quem cancelou.
    return falhou(motivoDaFalhaGoogle({
      codigo: url.searchParams.get("error_code") ?? url.searchParams.get("error"),
      mensagem: url.searchParams.get("error_description"),
    }));
  }

  try {
    const s = createClient();
    let error: { code?: string; message: string; name?: string; status?: number } | null;
    if (estado !== null) {
      // Ida pelo nosso domínio. Sem o cookie, a volta abriu noutro navegador
      // (ou o pedido passou do prazo); com o estado diferente, o código não é
      // deste navegador — nos dois casos nada é trocado.
      if (!pedido) return falhou("outro-navegador");
      if (!estadoConfere(pedido, estado)) {
        console.error("[falha·acesso] acesso.google: estado da volta diferente do pedido");
        return falhou("falha");
      }
      const token = await idTokenDoGoogle(code, voltaDoGoogle(url.origin), pedido.verificador);
      if (!token.ok) {
        const motivo = motivoDaFalhaGoogle({ codigo: token.codigo });
        if (motivo === "falha") console.error("[falha·acesso] acesso.google_token:", token.codigo);
        return falhou(motivo);
      }
      ({ error } = await s.auth.signInWithIdToken({ provider: "google", token: token.idToken, nonce: pedido.nonce }));
    } else {
      ({ error } = await s.auth.exchangeCodeForSession(code));
    }
    if (error) {
      const motivo = motivoDaFalhaGoogle({ codigo: error.code, mensagem: error.message });
      if (motivo === "falha") {
        console.error("[falha·acesso] acesso.google:", error.name, error.code ?? "-", error.status ?? "-", error.message);
      }
      return falhou(motivo);
    }
    const { data: orgs, error: erroOrgs } = await s.from("organizations").select("name").limit(20);
    if (erroOrgs) {
      // Sem saber se a conta é nova, a Home é o destino seguro: a pessoa já
      // tem sessão, e uma conta antiga mandada ao cadastro não teria saída.
      console.error("[falha·acesso] acesso.google_empresas:", erroOrgs.code ?? "-", erroOrgs.message);
      return para("/");
    }
    return para(destinoDoGoogle(((orgs ?? []) as { name?: string | null }[]).map((o) => o.name)));
  } catch (e) {
    console.error("[falha·acesso] acesso.google:", e instanceof Error ? e.message : String(e));
    return falhou("falha");
  }
}

/**
 * Troca o código pelo `id_token` no Google, com o segredo do cliente (que só
 * existe no servidor). Na falha devolve o CÓDIGO do erro do Google, nunca o
 * texto — ele vira palavra da lista em `motivoDaFalhaGoogle`.
 */
async function idTokenDoGoogle(
  code: string, volta: string, verificador: string,
): Promise<{ ok: true; idToken: string } | { ok: false; codigo: string }> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const segredo = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !segredo) return { ok: false, codigo: "configuracao_ausente" };
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: segredo, redirect_uri: volta,
      grant_type: "authorization_code", code_verifier: verificador,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const corpo = (await r.json().catch(() => ({}))) as { id_token?: unknown; error?: unknown };
  if (!r.ok || typeof corpo.id_token !== "string") {
    return { ok: false, codigo: typeof corpo.error === "string" ? corpo.error : `http_${r.status}` };
  }
  return { ok: true, idToken: corpo.id_token };
}
