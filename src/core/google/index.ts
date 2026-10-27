/**
 * ENTRAR COM O GOOGLE — as regras puras (o destino de quem volta e as frases).
 *
 * O fluxo tem três peças: o botão (`entrarComGoogle`, lib/entrada) manda ao
 * Google; o Google devolve ao Auth do Supabase; o Auth devolve a
 * `ROTA_GOOGLE`, que troca o código pela sessão NO SERVIDOR (só uma rota grava
 * cookie) e escolhe um destino desta lista. Mesmo desenho da recuperação de
 * senha (`core/recuperacao`).
 *
 * ⚠️ **A CONTA NOVA NÃO ENTRA SEM CADASTRO (decisão do dono, 27/10/2026).**
 * Quem clica em "Entrar com Google" sem ter conta ganha uma conta no Auth na
 * mesma hora, e o gatilho de cadastro (`handle_new_user`) cria a empresa com o
 * último recurso dele, `NOME_PROVISORIO` — o Google não manda nome de empresa
 * nenhum. Essa pessoa vai ao cadastro (`DESTINO_CADASTRO`), nunca à Home: uma
 * empresa chamada "Minha empresa", sem CNPJ e sem regime, é o "cadastro pela
 * metade" que a conversa de criar conta existe para impedir.
 *
 * ⚠️ **Os destinos são FIXOS.** Nada lê um destino da URL (um `?next=` seria
 * redirecionamento aberto); na falha viaja uma palavra da lista, nunca o texto
 * do erro.
 */

/** A rota que recebe a volta do Google (sob `/api`, pública no middleware). */
export const ROTA_GOOGLE = "/api/auth/google";

/*
 * ⚠️ **A AUTORIZAÇÃO VOLTA AO NOSSO DOMÍNIO (decisão do dono, 27/10/2026).**
 * No caminho do Supabase o Google devolve a autorização ao servidor de login
 * dele (`<projeto>.supabase.co`), e é ESSE domínio que a tela do Google mostra
 * ao cliente: "Prosseguir para dzszmbowhzopocqydnxu.supabase.co". Sem domínio
 * próprio do Auth (plano pago), a marca nunca aparece.
 *
 * O caminho próprio: `ROTA_GOOGLE_INICIO` manda ao Google com a volta em
 * `ROTA_GOOGLE` NO NOSSO domínio; a rota troca o código pelo `id_token` com o
 * segredo do cliente (só no servidor) e o entrega ao Supabase
 * (`signInWithIdToken`), que confere a assinatura do Google, a audiência e o
 * `nonce`. A sessão é a mesma de antes — só muda quem fala com o Google.
 *
 * ⚠️ O interruptor é `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (o id do cliente não é
 * segredo: ele já viaja na URL do Google). Sem ele, o botão segue pelo
 * caminho do Supabase, que continua funcionando.
 */

/** A rota que monta o pedido ao Google (estado, nonce e PKCE em cookie). */
export const ROTA_GOOGLE_INICIO = "/api/auth/google/inicio";

/** O cookie que guarda a prova do pedido até a volta (só a rota o lê). */
export const COOKIE_GOOGLE = "quattro_google_pedido";

/** Dez minutos para ir ao Google e voltar; acima disto é "expirado". */
export const PRAZO_PEDIDO_S = 600;

/**
 * A volta registrada no Google é a ORIGEM da página + `ROTA_GOOGLE`.
 * A MESMA função monta o pedido e a troca: o Google recusa a troca se as duas
 * não forem idênticas, letra a letra.
 */
export function voltaDoGoogle(origem: string): string {
  return `${origem.replace(/\/+$/, "")}${ROTA_GOOGLE}`;
}

/** O endereço do Google com o pedido completo. Os valores chegam prontos. */
export function enderecoDoGoogle(p: {
  clientId: string; volta: string; estado: string; nonceHash: string; desafio: string;
}): string {
  const q = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.volta,
    response_type: "code",
    scope: "openid email profile",
    state: p.estado,
    nonce: p.nonceHash,
    code_challenge: p.desafio,
    code_challenge_method: "S256",
    // Num computador com duas contas, entrar calado na errada abre a empresa errada.
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`;
}

/** O que o cookie do pedido carrega. */
export type PedidoGoogle = { estado: string; nonce: string; verificador: string };

/** Lê o cookie do pedido; o que não tem a forma certa não existe. */
export function lerPedidoGoogle(valor: string | null | undefined): PedidoGoogle | null {
  if (!valor) return null;
  try {
    const o = JSON.parse(valor) as Partial<PedidoGoogle>;
    const ok = (v: unknown) => typeof v === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(v);
    return ok(o.estado) && ok(o.nonce) && ok(o.verificador)
      ? { estado: o.estado!, nonce: o.nonce!, verificador: o.verificador! }
      : null;
  } catch {
    return null;
  }
}

/**
 * O `state` da volta é o MESMO do pedido? Comparação de tempo constante: o
 * estado é o que impede alguém de plantar o próprio código no navegador alheio
 * (a sessão abriria na conta de quem plantou).
 */
export function estadoConfere(pedido: PedidoGoogle | null, estadoDaVolta: string | null): boolean {
  if (!pedido || !estadoDaVolta || estadoDaVolta.length !== pedido.estado.length) return false;
  let dif = 0;
  for (let i = 0; i < estadoDaVolta.length; i++) dif |= estadoDaVolta.charCodeAt(i) ^ pedido.estado.charCodeAt(i);
  return dif === 0;
}

/** O último recurso do gatilho de cadastro — o nome de quem ainda não tem nome. */
export const NOME_PROVISORIO = "Minha empresa";

/** Para onde vai a conta que ainda não fez o cadastro da empresa. */
export const DESTINO_CADASTRO = "/criar-conta?google=1";

/**
 * O destino de quem acabou de voltar do Google, pelas empresas da conta.
 *
 * Conta nova = UMA empresa só, ainda com o nome provisório. Quem já tem outra
 * empresa (sócio convidado) entra normalmente: a provisória dele não é a porta.
 * O segundo fator NÃO é decidido aqui — o middleware o cobra na próxima página.
 */
export function destinoDoGoogle(nomesDasEmpresas: readonly (string | null | undefined)[]): string {
  const nomes = nomesDasEmpresas.map((n) => (n ?? "").trim());
  if (nomes.length === 1 && nomes[0] === NOME_PROVISORIO) return DESTINO_CADASTRO;
  return "/";
}

export type MotivoGoogle = "cancelado" | "expirado" | "outro-navegador" | "falha";
const MOTIVOS: readonly MotivoGoogle[] = ["cancelado", "expirado", "outro-navegador", "falha"];

/** Traduz a falha do Auth (ou do Google) numa palavra da lista. */
export function motivoDaFalhaGoogle(e: { codigo?: string | null; mensagem?: string | null }): MotivoGoogle {
  const t = `${e.codigo ?? ""} ${e.mensagem ?? ""}`.toLowerCase();
  if (/access_denied|denied|cancel/.test(t)) return "cancelado";
  if (/code verifier|code_verifier|pkce|flow_state_not_found|bad_code_verifier/.test(t)) return "outro-navegador";
  if (/expired|expirad|flow_state_expired|otp_expired|invalid_grant/.test(t)) return "expirado";
  return "falha";
}

/** Lê o `?google=` do login; o que não está na lista não existe. */
export function lerMotivoGoogle(v: string | null): MotivoGoogle | null {
  return v && (MOTIVOS as readonly string[]).includes(v) ? (v as MotivoGoogle) : null;
}

export const MENSAGEM_GOOGLE: Record<MotivoGoogle, string> = {
  cancelado: "O acesso com o Google foi cancelado. Tente de novo ou entre com e-mail e senha.",
  expirado: "A volta do Google demorou demais. Clique em Entrar com Google de novo.",
  "outro-navegador": "A volta do Google abriu em outro navegador. Comece e termine no mesmo navegador.",
  falha: "Não foi possível entrar com o Google agora. Tente de novo em alguns segundos.",
};
