import { type NextRequest, type NextFetchEvent, NextResponse } from "next/server";
import { updateSession, planoDoUsuario } from "@/lib/supabase/middleware";
import { exigePro } from "@/core/planos";
import { destinoDe } from "@/core/rotas/aliases";
import { registrarAcessoAlias } from "@/lib/supabase/middleware";

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
export async function middleware(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;

  /*
   * ⚠️ OS ENDEREÇOS ANTIGOS, resolvidos no SERVIDOR e antes de tudo.
   *
   * Eram 34 desvios feitos no cliente: a página montava vazia, um `useEffect`
   * disparava e só então o navegador ia para o destino. Sem redirecionamento
   * HTTP, quem compartilha o link, o histórico e qualquer pré-visualização
   * enxergam uma página em branco — e cada acesso pisca antes de sair do lugar.
   *
   * Vem ANTES da autenticação de propósito: um link antigo tem de levar ao
   * destino certo mesmo quando a pessoa ainda precisa entrar, senão ela loga e
   * cai na Home, perdendo o endereço que tentou abrir.
   */
  const desvio = destinoDe(pathname, request.nextUrl.search);
  if (desvio) {
    /*
     * ⚠️ REGISTRA O ACESSO antes de desviar. "Remover o alias quando ninguém
     * mais usar" só é possível se alguém contar — sem contagem, desligar um
     * endereço antigo é aposta: ou se remove cedo e um cliente perde o link
     * que estava no favorito, ou se mantém para sempre por precaução, e a
     * lista vira um cemitério que só cresce.
     *
     * `event.waitUntil` de propósito: a contagem não pode atrasar o desvio.
     * A resposta 308 sai na hora; o registro termina depois.
     */
    event.waitUntil(registrarAcessoAlias(pathname));
    // 308 (permanente): são links já compartilhados e em favoritos. Um 302
    // diria ao navegador "volte a perguntar", e o endereço antigo nunca
    // deixaria de ser tratado como o canônico.
    return NextResponse.redirect(new URL(desvio, request.url), 308);
  }

  const { response, user, configured, supabase } = await updateSession(request);
  if (!configured) return response;

  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/comecar") ||
    // A política de privacidade precisa ser legível ANTES do cadastro — uma
    // política atrás de login é uma política que ninguém pôde ler antes de
    // aceitar, o que derrota a razão de ela existir.
    pathname.startsWith("/privacidade") ||
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
  if (user && supabase && exigePro(pathname, request.nextUrl.searchParams)) {
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

/**
 * ⚠️ ARQUIVO ESTÁTICO NÃO PASSA PELA PORTARIA.
 *
 * O matcher excluía `_next/static` e `.png`, mas nada mais — então
 * `/fonts/roobert-medium.otf` entrava aqui e, sem sessão, era desviado para
 * `/login` com **307**. O efeito: na tela de login (e em qualquer visita não
 * autenticada) a Roobert nunca carregava, e o texto caía no fallback do
 * sistema sem nenhum erro visível. Medido em produção: `http=307`,
 * `content-type: text/plain`, 15 bytes — a fonte respondia com um
 * redirecionamento.
 *
 * As fontes são self-hosted justamente para não depender de fetch externo;
 * trancá-las atrás do login desfaz metade disso. E mesmo para quem ESTÁ
 * autenticado havia custo: cada arquivo disparava uma verificação de sessão
 * no Supabase antes de ser servido.
 *
 * A lista cobre o que vive em `public/`: fontes, imagens, o CSV de exemplo e
 * os manifestos. Extensão é o critério certo aqui — um caminho novo em
 * `public/` passa a funcionar sozinho, enquanto uma lista de PASTAS
 * (`fonts|exemplos|…`) precisaria ser editada a cada pasta nova, e ninguém
 * lembra até a fonte sumir de novo.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|otf|ttf|woff|woff2|eot|css|js|map|txt|xml|csv|json|webmanifest)$).*)",
  ],
};
