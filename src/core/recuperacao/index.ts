/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RECUPERAÇÃO DE SENHA — as regras, num lugar só (puro, sem rede)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O "esqueci a senha" mandava o e-mail e não levava a lugar nenhum: o link
 * voltava para `/login?code=…`, nada trocava o código pela sessão e não havia
 * tela de senha nova (achado em 07/10/2026, `docs/rodada-10/dominio.md`).
 *
 * O caminho agora:
 *
 *   tela de login ── pedirRedefinicao ──▶ e-mail com o link
 *   link ──▶ ROTA_RETORNO (/api/auth/recuperar, servidor)
 *            troca o código pela sessão de recuperação
 *            ├─ certo  ──▶ DESTINO_RECUPERACAO (/redefinir-senha)
 *            └─ errado ──▶ /login?recuperacao=<motivo>
 *
 * ⚠️ **O destino é FIXO, nunca um parâmetro da URL.** Um `?next=` lido pela rota
 * de retorno seria um redirecionamento aberto: um link legítimo do nosso
 * domínio que entrega a pessoa — já com sessão — num endereço de terceiro.
 *
 * ⚠️ **O motivo que volta na URL é uma PALAVRA da lista, nunca o texto do
 * erro.** A tela só mostra frases desta casa; ecoar `error_description` seria
 * pôr na tela, em inglês, o que qualquer um pode escrever num link.
 */

/** O mínimo de caracteres da senha — o mesmo no cadastro e na troca. */
export const MIN_SENHA = 6;

/** Para onde o link do e-mail volta: a rota que troca o código no servidor. */
export const ROTA_RETORNO = "/api/auth/recuperar";

/** A tela da senha nova. Só abre com a sessão de recuperação. */
export const DESTINO_RECUPERACAO = "/redefinir-senha";

/** Por que a recuperação não abriu — a palavra que viaja na URL. */
export type MotivoRecuperacao = "expirado" | "outro-navegador" | "invalido" | "falha";

const MOTIVOS: readonly MotivoRecuperacao[] = ["expirado", "outro-navegador", "invalido", "falha"];

/**
 * Traduz o erro do Auth no motivo. Olha o CÓDIGO primeiro (estável) e só
 * depois o texto (que muda entre versões).
 *
 * ⚠️ **"Outro navegador" é o caso que mais confunde, e tem frase própria.** O
 * link só vale no navegador que pediu a redefinição: a prova de que foi a
 * mesma pessoa fica num cookie dele. Aberto no celular depois de pedir no
 * computador, o link falha — e "link vencido" mandaria pedir outro e abri-lo
 * no celular de novo, repetindo a falha.
 */
export function motivoDaFalha(erro: {
  codigo?: string | null; mensagem?: string | null; status?: number | null; nome?: string | null;
}): MotivoRecuperacao {
  // ⚠️ O que é PASSAGEIRO (rede, servidor fora, limite de requisições) não é
  // "link inválido": a frase mandaria descartar um link que talvez valha.
  const status = erro.status ?? 0;
  if (erro.nome === "AuthRetryableFetchError" || status >= 500 || status === 429) return "falha";
  const codigo = (erro.codigo ?? "").toLowerCase();
  const mensagem = (erro.mensagem ?? "").toLowerCase();
  if (codigo === "pkce_code_verifier_not_found" || codigo === "bad_code_verifier" || mensagem.includes("code verifier")) {
    return "outro-navegador";
  }
  if (
    codigo === "otp_expired" || codigo === "flow_state_expired" || codigo === "flow_state_not_found"
    || mensagem.includes("expired") || mensagem.includes("already been used") || mensagem.includes("invalid flow state")
  ) {
    return "expirado";
  }
  return "invalido";
}

/** Lê o motivo da URL — só aceita palavra da lista; o resto é ignorado. */
export function lerMotivo(valor: string | null | undefined): MotivoRecuperacao | null {
  return MOTIVOS.includes(valor as MotivoRecuperacao) ? (valor as MotivoRecuperacao) : null;
}

/** O que a tela de login diz para cada motivo — e o que a pessoa faz agora. */
export const MENSAGEM_RECUPERACAO: Record<MotivoRecuperacao, { motivo: string; comoResolver: string }> = {
  expirado: {
    motivo: "Este link de redefinição expirou ou já foi usado.",
    comoResolver: "Peça um novo link abaixo.",
  },
  // ⚠️ Neutra de propósito: o mesmo motivo serviria a um link de confirmação de
  // cadastro aberto noutro aparelho, se a confirmação de e-mail for religada.
  "outro-navegador": {
    motivo: "O link foi aberto num navegador diferente daquele em que foi pedido.",
    comoResolver: "Peça um novo link e abra o e-mail neste mesmo navegador.",
  },
  invalido: {
    motivo: "Este link de redefinição não é válido.",
    comoResolver: "Peça um novo link abaixo.",
  },
  // ⚠️ "Tente o mesmo link de novo" não funciona: a tentativa consome a prova
  // guardada no navegador. Só um link novo resolve.
  falha: {
    motivo: "Não foi possível abrir o link agora.",
    comoResolver: "Peça um novo link abaixo.",
  },
};

/** Confere a senha nova antes de qualquer rede. `null` quando está pronta. */
export function problemaDaSenha(nova: string, repetida: string): string | null {
  if (nova.length < MIN_SENHA) return `Use pelo menos ${MIN_SENHA} caracteres.`;
  if (nova !== repetida) return "As duas senhas não são iguais.";
  return null;
}

/**
 * Quanto tempo depois de abrir o link a tela de senha nova continua aberta.
 * O mesmo prazo de validade do link do e-mail (1 hora, o padrão do Auth).
 */
export const JANELA_RECUPERACAO_S = 60 * 60;

/**
 * A sessão nasceu de um link de recuperação, há pouco?
 *
 * ⚠️ **É isto que impede a tela de senha nova de virar "troque a senha de quem
 * deixou o sistema aberto".** O middleware só pergunta se HÁ sessão; uma
 * sessão comum, num computador compartilhado, abriria a tela e trocaria a
 * senha sem pedir a atual — e a troca derruba as outras sessões do dono. O
 * Auth marca a sessão vinda do link com `amr: [{ method: "recovery",
 * timestamp }]`; sem essa marca, ou com ela velha, a tela não abre.
 */
export function sessaoDeRecuperacaoValida(amr: unknown, agoraS: number): boolean {
  if (!Array.isArray(amr)) return false;
  return amr.some((a) => {
    if (!a || typeof a !== "object") return false;
    const { method, timestamp } = a as { method?: unknown; timestamp?: unknown };
    return method === "recovery" && typeof timestamp === "number"
      && agoraS - timestamp >= 0 && agoraS - timestamp < JANELA_RECUPERACAO_S;
  });
}
