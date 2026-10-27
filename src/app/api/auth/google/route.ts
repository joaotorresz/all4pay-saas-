import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { destinoDoGoogle, motivoDaFalhaGoogle, type MotivoGoogle } from "@/core/google";

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
  if (!code) {
    // O Google (ou o Auth) devolve o erro na URL: "access_denied" é quem cancelou.
    return falhou(motivoDaFalhaGoogle({
      codigo: url.searchParams.get("error_code") ?? url.searchParams.get("error"),
      mensagem: url.searchParams.get("error_description"),
    }));
  }

  try {
    const s = createClient();
    const { error } = await s.auth.exchangeCodeForSession(code);
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
