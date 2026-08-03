import { type NextRequest, NextResponse } from "next/server";
import { updateSession, planoDoUsuario } from "@/lib/supabase/middleware";
import { exigePro } from "@/core/planos";

/**
 * Route guard. Only enforces auth when Supabase is configured (live);
 * in demo mode the app stays open. Public paths: /login, /api, assets.
 *
 * ⚠️ **O gating de plano acontece AQUI, no servidor, antes de qualquer render.**
 * Ele morava no menu: com o Modo Pro em "simples" os grupos Inteligência e
 * Governança sumiam da navegação, e `/copiloto`, `/investidores`, `/impostos`,
 * `/aprovacoes`, `/governanca` e `/automacoes` continuavam respondendo 200 para
 * quem digitasse o endereço. Menu é apresentação; quem tranca porta é servidor.
 */
export async function middleware(request: NextRequest) {
  const { response, user, configured, supabase } = await updateSession(request);
  if (!configured) return response;

  const { pathname } = request.nextUrl;
  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/comecar") ||
    pathname.startsWith("/api");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (user && pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // O plano só é consultado quando a rota realmente exige Pro: uma RPC por
  // navegação em TODA rota custaria latência na aplicação inteira para
  // responder a uma pergunta que quase nenhuma tela faz.
  if (user && supabase && exigePro(pathname)) {
    const plano = await planoDoUsuario(supabase);
    if (plano.plano !== "pro") {
      const url = request.nextUrl.clone();
      url.pathname = "/planos";
      // Leva o destino junto: a tela de upgrade diz QUAL recurso foi pedido, e
      // depois de assinar dá para voltar exatamente para onde a pessoa ia.
      url.search = `?de=${encodeURIComponent(pathname)}`;
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
