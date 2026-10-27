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
  if (/expired|expirad|flow_state_expired|otp_expired/.test(t)) return "expirado";
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
