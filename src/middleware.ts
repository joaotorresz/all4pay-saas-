import { type NextRequest, type NextFetchEvent, NextResponse } from "next/server";
import { updateSession, planoDoUsuario, ehDonoDaPlataforma, exigeCodigo } from "@/lib/supabase/middleware";
import { ROTA_CODIGO, ehRotaDoCodigo } from "@/core/segundo-fator";
import { exigePro } from "@/core/planos";
import { destinoDe } from "@/core/rotas/aliases";
import { lerMotivo } from "@/core/recuperacao";
import { registrarAcessoAlias } from "@/lib/supabase/middleware";
import { decidirPorHost } from "@/core/area-admin";

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
  const { pathname: pedido } = request.nextUrl;

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
  const desvio = destinoDe(pedido, request.nextUrl.search);
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
    event.waitUntil(registrarAcessoAlias(pedido));
    // 308 (permanente): são links já compartilhados e em favoritos. Um 302
    // diria ao navegador "volte a perguntar", e o endereço antigo nunca
    // deixaria de ser tratado como o canônico.
    return NextResponse.redirect(new URL(desvio, request.url), 308);
  }

  /*
   * ⚠️ A ÁREA DA PLATAFORMA MORA NO SEU PRÓPRIO ENDEREÇO (`ADMIN_HOST`,
   * regras em `core/area-admin`). Lá, `/` e `/clientes` servem `/admin` e
   * `/admin/clientes` por REESCRITA — e daqui para baixo toda porta olha o
   * caminho EFETIVO (`pathname`), nunca o que a pessoa digitou (`pedido`): senão o
   * perímetro da plataforma veria `/clientes`, não reconheceria a área e
   * deixaria passar sem perguntar quem é o dono.
   */
  const decisao = decidirPorHost({
    host: request.headers.get("host") ?? request.nextUrl.host,
    pathname: pedido,
    hostAdmin: process.env.ADMIN_HOST,
  });
  if (decisao.tipo === "redirecionar") {
    const url = request.nextUrl.clone();
    url.hostname = decisao.host;
    url.pathname = decisao.caminho;
    return NextResponse.redirect(url, 308);
  }
  if (decisao.tipo === "inexistente") {
    return pedido.startsWith("/api")
      ? NextResponse.json({ erro: "inexistente" }, { status: 404 })
      : new NextResponse(null, { status: 404 });
  }
  const pathname = decisao.tipo === "reescrever" ? decisao.caminho : pedido;

  const { response, user, configured, supabase } = await updateSession(request);
  /*
   * A resposta que SEGUE. Na reescrita ela leva a requisição (com os cookies
   * que o `getUser` acabou de renovar) ao caminho efetivo, e devolve ao
   * navegador os mesmos cookies — perder um dos dois faria o próximo clique
   * apresentar o token antigo, já trocado.
   */
  const seguir = () => {
    if (decisao.tipo !== "reescrever") return response;
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    const reescrita = NextResponse.rewrite(url, { request });
    response.cookies.getAll().forEach((c) => reescrita.cookies.set(c));
    return reescrita;
  };
  if (!configured) return seguir();

  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/comecar") ||
    // O cadastro de três campos é a porta de entrada — pública, como o login.
    pathname.startsWith("/criar-conta") ||
    // A política de privacidade precisa ser legível ANTES do cadastro — uma
    // política atrás de login é uma política que ninguém pôde ler antes de
    // aceitar, o que derrota a razão de ela existir.
    pathname.startsWith("/privacidade") ||
    // ⚠️ Mesma razão da privacidade, aplicada ao número: uma metodologia atrás
    // de login só é lida por quem já comprou, e é ANTES de comprar que alguém
    // precisa saber o que entra em cada linha e onde o sistema para.
    pathname.startsWith("/metodologia") ||
    pathname.startsWith("/api");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  /*
   * ⚠️ **O SEGUNDO FATOR, antes de qualquer outra porta.** Quem tem aplicativo
   * autenticador e entrou só com a senha (sessão aal1) vai ao passo do código
   * — e só a ele — até digitá-lo. Vem ANTES do perímetro da plataforma: sem
   * isso, o administrador com aplicativo veria "área exclusiva do
   * administrador" (a frase errada) em vez do pedido do código.
   *
   * O inverso também vale: quem NÃO precisa do código e abre o passo vai ao
   * início, para a tela nunca pedir um código que não existe.
   *
   * ⚠️ **`/api` também é barrada, com JSON.** Uma sessão que deve o código
   * não chama rota de API nenhuma: medido, ela mandava WhatsApp da empresa
   * (`/api/cobranca/whatsapp`, texto livre) com a senha só — o banco não
   * olha o nível do token fora do `admin_veredito`. A resposta é 401 em JSON
   * (um desvio HTML quebraria quem chama). Webhook e cron chegam sem cookie
   * de sessão (`user` nulo) e não passam por aqui. A exceção é
   * `/api/auth/*`: o retorno do "esqueci a senha" abre a sessão nova e
   * precisa rodar mesmo com uma sessão antiga sem o código no navegador.
   */
  if (user && supabase && pathname.startsWith("/api")) {
    if (!pathname.startsWith("/api/auth/") && (await exigeCodigo(supabase, user))) {
      const semCodigo = NextResponse.json(
        { erro: "codigo_pendente", mensagem: "Digite o código do aplicativo autenticador para continuar." },
        { status: 401 },
      );
      response.cookies.getAll().forEach((c) => semCodigo.cookies.set(c));
      return semCodigo;
    }
  } else if (user && supabase) {
    const pedeCodigo = await exigeCodigo(supabase, user);
    if (pedeCodigo !== ehRotaDoCodigo(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = pedeCodigo ? ROTA_CODIGO : "/";
      url.search = "";
      const aoCodigo = NextResponse.redirect(url);
      // O token renovado pelo `getUser` vai junto: um redirecionamento que o
      // perde faria o navegador reapresentar o token antigo, já trocado.
      response.cookies.getAll().forEach((c) => aoCodigo.cookies.set(c));
      return aoCodigo;
    }
  }
  /*
   * ⚠️ **A volta de um link de redefinição fica no login mesmo com sessão.**
   * Quem já está logado e abre um link vencido, usado ou de outro navegador
   * precisa LER por que ele falhou (`?recuperacao=`), e um `?code=` parado
   * precisa chegar ao login para ser encaminhado à rota de retorno. Mandados
   * para a Home, o motivo some e o código cai numa tela que não o trata.
   */
  const voltaDeLink =
    lerMotivo(request.nextUrl.searchParams.get("recuperacao")) !== null || request.nextUrl.searchParams.has("code");
  if (user && pathname.startsWith("/login") && !voltaDeLink) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  /**
   * ═════════════════════════════════════════════════════════════════════════
   * A ÁREA DA PLATAFORMA — 403 no PERÍMETRO, antes de servir qualquer byte
   * ═════════════════════════════════════════════════════════════════════════
   *
   * ⚠️ **O que existia e o que faltava.** O banco já trancava de verdade:
   * medido em produção com o papel de um usuário comum, `admin_orgs()`,
   * `admin_users()`, `admin_overview()` e `admin_set_subscription()` respondem
   * *"Acesso administrativo negado"*, e `plans`/`subscriptions`/
   * `platform_admins` dão *permission denied* no acesso direto. **Não havia
   * vazamento de dado.**
   *
   * O que faltava era o 403 no perímetro: `/admin` respondia **200** para
   * qualquer usuário autenticado, entregava o pacote JavaScript do painel e
   * deixava o CLIENTE decidir mostrar "Acesso restrito". Decisão de acesso no
   * cliente é apresentação, não controle — e um 200 informa que a rota existe.
   *
   * ⚠️ **403, não redirecionamento.** Mandar para a Home esconderia a recusa e
   * faria a pessoa achar que clicou errado; mandar para `/login` sugeriria que
   * basta outra sessão. O 403 diz a verdade: a rota existe e você não entra.
   *
   * ⚠️ **`/api/admin/*` entra aqui apesar de `/api` ser público no matcher
   * acima.** Aquela exceção existe para as rotas que se autenticam sozinhas
   * (webhook, cron com segredo). O endpoint de personificação já checa por
   * dentro — este é o segundo cadeado, e ele vem antes do handler rodar.
   */
  const areaDaPlataforma = pathname === "/admin"
    || pathname.startsWith("/admin/")
    || pathname.startsWith("/api/admin/");
  if (areaDaPlataforma && supabase) {
    if (!user || !(await ehDonoDaPlataforma(supabase))) {
      return new NextResponse(
        JSON.stringify({
          erro: "acesso_restrito",
          mensagem: "Esta área é exclusiva do administrador da plataforma.",
        }),
        { status: 403, headers: { "content-type": "application/json; charset=utf-8" } },
      );
    }
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

  return seguir();
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
