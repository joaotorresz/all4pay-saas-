/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A ÁREA DA PLATAFORMA NO SEU PRÓPRIO ENDEREÇO — `admin.quattro.finance`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O painel do dono da plataforma (planos, cobrança, acessos, suporte) e o
 * sistema dos clientes são o MESMO código. O que os separa é o ENDEREÇO: em
 * `ADMIN_HOST` só a área da plataforma responde; nos outros endereços `/admin`
 * leva para lá.
 *
 * ⚠️ **Sem `ADMIN_HOST`, nada muda.** Prévias da Vercel, a máquina local e a
 * produção antes de o DNS existir continuam com `/admin` no próprio endereço.
 * Desviar para um domínio que ainda não responde trancaria o dono fora do
 * painel no dia do deploy — o interruptor é a variável, ligada DEPOIS de o
 * domínio responder.
 *
 * ⚠️ **No endereço da plataforma o endereço é LIMPO** (`/clientes`, não
 * `/admin/clientes`): todo caminho de página vira `/admin/<caminho>` por
 * reescrita. Um caminho do sistema dos clientes (`/fluxo-caixa`) vira
 * `/admin/fluxo-caixa`, que não existe — 404, que é exatamente o que se quer:
 * o menu, as telas e as rotas de API do cliente não respondem ali.
 *
 * ⚠️ **A exceção é a porta de entrada**, que é a mesma do app: login, o passo
 * do código, o cadastro do aplicativo autenticador e o retorno do "esqueci a
 * senha". Sem elas não há como entrar — e o cookie de sessão é POR ENDEREÇO,
 * então quem entra no app não está automaticamente dentro da plataforma.
 *
 * ⚠️ **`/api/admin/*` só responde no endereço da plataforma** quando ele está
 * ligado: uma segunda porta para as mesmas rotas é a porta que ninguém vigia.
 *
 * Puro, sem I/O. Versão `area-admin/1.0.0`.
 */

/** Páginas que respondem no endereço da plataforma sem prefixo — a porta de entrada. */
export const PORTA_DE_ENTRADA: readonly string[] = [
  "/login",
  "/segundo-fator",
  "/configuracoes/seguranca",
  "/redefinir-senha",
];

/** Rotas de API que respondem no endereço da plataforma: as da área e as da entrada. */
export const API_NO_ADMIN: readonly string[] = ["/api/admin", "/api/auth"];

export type DecisaoHost =
  /** Segue como está. */
  | { tipo: "seguir" }
  /** Serve outro caminho sem mudar o endereço que a pessoa vê. */
  | { tipo: "reescrever"; caminho: string }
  /** Manda para o endereço da plataforma (308). `caminho` é o caminho LIMPO lá. */
  | { tipo: "redirecionar"; host: string; caminho: string }
  /** Não existe neste endereço. */
  | { tipo: "inexistente" };

const debaixo = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

/** Só o nome do host, minúsculo e sem porta. Vazio vira `null`. */
export function normalizarHost(h: string | null | undefined): string | null {
  const s = (h ?? "").trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  return s ? s : null;
}

/**
 * O que fazer com esta requisição, dado o endereço em que ela chegou.
 *
 * `hostAdmin` vem de `ADMIN_HOST`; `null` desliga a separação inteira.
 */
export function decidirPorHost(p: { host: string | null | undefined; pathname: string; hostAdmin: string | null | undefined }): DecisaoHost {
  const alvo = normalizarHost(p.hostAdmin);
  if (!alvo) return { tipo: "seguir" };
  const host = normalizarHost(p.host);
  const { pathname } = p;

  if (host === alvo) {
    if (pathname.startsWith("/api")) {
      return API_NO_ADMIN.some((b) => debaixo(pathname, b)) ? { tipo: "seguir" } : { tipo: "inexistente" };
    }
    if (debaixo(pathname, "/admin")) return { tipo: "seguir" };
    if (PORTA_DE_ENTRADA.some((b) => debaixo(pathname, b))) return { tipo: "seguir" };
    return { tipo: "reescrever", caminho: pathname === "/" ? "/admin" : `/admin${pathname}` };
  }

  // Qualquer outro endereço: a área da plataforma mora lá, não aqui.
  if (debaixo(pathname, "/api/admin")) return { tipo: "inexistente" };
  if (debaixo(pathname, "/admin")) {
    const resto = pathname.slice("/admin".length);
    return { tipo: "redirecionar", host: alvo, caminho: resto || "/" };
  }
  return { tipo: "seguir" };
}

/* ========================================================================== */
/* O segundo fator é OBRIGATÓRIO na área da plataforma                        */
/* ========================================================================== */

/**
 * O que a área da plataforma pede a quem já provou ser o dono.
 *
 * - `entrar`: sessão `aal2` — senha E código do aplicativo.
 * - `cadastrar_aplicativo`: a conta não tem aplicativo autenticador. No resto
 *   do app isso é escolha da pessoa; aqui não — a área que muda plano,
 *   cobrança e "loga como" o cliente não abre com a senha só.
 * - `digitar_codigo`: tem aplicativo e a sessão é só da senha.
 *
 * ⚠️ **Falha FECHADA**: nível que não pôde ser lido (`null`) pede o código.
 */
export type PortaAdmin = "entrar" | "cadastrar_aplicativo" | "digitar_codigo";

export function portaSegundoFatorAdmin(s: { temFatorVerificado: boolean; nivelAtual: string | null | undefined }): PortaAdmin {
  if (!s.temFatorVerificado) return "cadastrar_aplicativo";
  return s.nivelAtual === "aal2" ? "entrar" : "digitar_codigo";
}

/** Rótulo da recusa em JSON (`/api/admin/*`), um por porta fechada. */
export const ERRO_PORTA_ADMIN: Record<Exclude<PortaAdmin, "entrar">, { erro: string; mensagem: string }> = {
  cadastrar_aplicativo: {
    erro: "segundo_fator_obrigatorio",
    mensagem: "A área da plataforma exige o aplicativo autenticador. Cadastre-o em Segurança da conta.",
  },
  digitar_codigo: {
    erro: "codigo_pendente",
    mensagem: "Digite o código do aplicativo autenticador para continuar.",
  },
};

/* ========================================================================== */
/* "Logar como" leva ao APP, nunca de volta à plataforma                       */
/* ========================================================================== */

/**
 * O endereço do app dos clientes, visto de dentro da área da plataforma.
 *
 * ⚠️ O "logar como" gera um link mágico que abre a sessão do CLIENTE no
 * endereço para onde ele aponta. Apontado para o endereço da plataforma, o
 * cliente cairia num lugar onde não entra (o segundo fator e o 403). E há um
 * ganho de graça: como o cookie é por endereço, a sessão do cliente nasce no
 * app e a do dono continua de pé na plataforma — ninguém mais precisa "sair
 * da conta de admin" para ver como o cliente.
 *
 * `APP_HOST` manda; sem ele, `admin.<domínio>` vira `app.<domínio>`.
 */
export function origemDoApp(p: { origem: string; hostAdmin: string | null | undefined; hostApp?: string | null }): string {
  const alvo = normalizarHost(p.hostAdmin);
  const url = new URL(p.origem);
  if (!alvo || normalizarHost(url.host) !== alvo) return url.origin;
  const app = normalizarHost(p.hostApp) ?? alvo.replace(/^admin\./, "app.");
  url.hostname = app;
  return url.origin;
}

/* ========================================================================== */
/* As seções do painel — a fonte única do menu e das páginas                   */
/* ========================================================================== */

export interface SecaoAdmin { id: string; rotulo: string; href: string; icone: string; resumo: string }

/**
 * ⚠️ `href` sob `/admin`: funciona nos dois modos — no endereço da plataforma
 * `/admin/*` segue como está, e sem `ADMIN_HOST` é o próprio caminho.
 */
export const SECOES_ADMIN: readonly SecaoAdmin[] = [
  { id: "visao-geral", rotulo: "Visão geral", href: "/admin", icone: "house", resumo: "Receita recorrente, base de clientes e crescimento." },
  { id: "clientes", rotulo: "Clientes e planos", href: "/admin/clientes", icone: "building", resumo: "Plano e status de cobrança de cada empresa, e os planos oferecidos." },
  { id: "cobranca", rotulo: "Cobrança", href: "/admin/cobranca", icone: "credit-card", resumo: "Quem paga × quem usa, e a receita mês a mês." },
  { id: "acessos", rotulo: "Acessos", href: "/admin/acessos", icone: "shield-check", resumo: "Contas da plataforma e a trilha das ações do administrador." },
  { id: "suporte", rotulo: "Suporte", href: "/admin/suporte", icone: "help-circle", resumo: "Ver e entrar como o cliente, integrações e ferramentas internas." },
];

/** A seção ativa para um caminho, aceitando o endereço limpo (`/clientes`) e o longo (`/admin/clientes`). */
export function secaoAtiva(pathname: string): SecaoAdmin {
  const limpo = pathname.replace(/^\/admin(?=\/|$)/, "") || "/";
  return SECOES_ADMIN.find((s) => s.href !== "/admin" && (limpo === s.href.slice(6) || limpo.startsWith(`${s.href.slice(6)}/`))) ?? SECOES_ADMIN[0];
}
