/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SEGUNDO FATOR — as regras, num lugar só (puro, sem rede)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O segundo fator da conta é um APLICATIVO AUTENTICADOR (código de 6 dígitos
 * que muda a cada 30 segundos). A conta de administrador da plataforma o EXIGE
 * (`admin_veredito`, pelo `aal` do token), e o app não tinha tela para
 * cadastrá-lo nem passo para digitá-lo: o prazo venceu em 03/09/2026 e o
 * administrador ficou trancado fora da própria área, sem como cumprir a regra
 * (`docs/rodada-10/segundo-fator.md`).
 *
 *   entrar com a senha ──▶ sessão aal1
 *     ├─ sem aplicativo cadastrado ──▶ o sistema
 *     └─ com aplicativo ──▶ ROTA_CODIGO ── código certo ──▶ sessão aal2 ──▶ destino FIXO
 *
 * ⚠️ **Quem decide se pede o código é o MIDDLEWARE, pelo `user.factors` que
 * o `getUser` acabou de trazer do servidor** — nunca pela cópia do usuário
 * guardada no cookie, que não sabe de um aplicativo cadastrado noutro aparelho
 * depois da entrada.
 *
 * ⚠️ **O destino depois do código é FIXO**, decidido pela sessão (como o
 * "esqueci a senha"): um `?next=` seria um redirecionamento aberto com sessão.
 */
import { DESTINO_RECUPERACAO, sessaoDeRecuperacaoValida } from "@/core/recuperacao";

/** O passo do código. É a ÚNICA rota que uma sessão aal1 com fator abre. */
export const ROTA_CODIGO = "/segundo-fator";

/** Onde a pessoa cadastra, vê e remove o aplicativo autenticador. */
export const ROTA_SEGURANCA_CONTA = "/configuracoes/seguranca";

/** Quantos dígitos o código tem. */
export const DIGITOS_CODIGO = 6;

/** Nome que aparece no aplicativo da pessoa quando ela não tem outro aparelho. */
export const NOME_APARELHO = "Aplicativo autenticador";

/** É a rota do passo do código (ou algo debaixo dela)? */
export function ehRotaDoCodigo(pathname: string): boolean {
  return pathname === ROTA_CODIGO || pathname.startsWith(`${ROTA_CODIGO}/`);
}

/**
 * O que a pessoa digitou, só com os dígitos. Espaço e hífen somem: o
 * aplicativo mostra "123 456" e quem copia leva o espaço junto.
 */
export function normalizarCodigo(digitado: string): string {
  return (digitado ?? "").replace(/\D/g, "").slice(0, DIGITOS_CODIGO);
}

/** O código está completo? Conferido ANTES da rede: um envio que não pode passar gasta tentativa. */
export function codigoCompleto(digitado: string): boolean {
  return new RegExp(`^\\d{${DIGITOS_CODIGO}}$`).test((digitado ?? "").replace(/[\s-]/g, ""));
}

/**
 * A sessão precisa do código?
 *
 * ⚠️ **Falha FECHADA.** Com aplicativo cadastrado, qualquer nível que não seja
 * `aal2` — inclusive o nível que não pôde ser lido (`null`) — pede o código.
 * Abrir quando a leitura falha é abrir exatamente quando o sistema está pior.
 *
 * ⚠️ **E nunca pede de quem já está em `aal2`.** Perguntar só "há aplicativo?"
 * mandaria de volta ao código quem acabou de digitá-lo — um laço.
 */
export function precisaDoCodigo(s: { nivelAtual: string | null | undefined; temFatorVerificado: boolean }): boolean {
  return s.temFatorVerificado && s.nivelAtual !== "aal2";
}

/**
 * Para onde a pessoa vai depois do código certo.
 *
 * Quem chegou pelo link do "esqueci a senha" volta à tela da senha nova (a
 * marca `recovery` continua na sessão depois do código — medido no Auth
 * local); qualquer outra sessão vai para o início. Nunca um endereço da URL.
 */
export function destinoDepoisDoCodigo(amr: unknown, agoraS: number): string {
  return sessaoDeRecuperacaoValida(amr, agoraS) ? DESTINO_RECUPERACAO : "/";
}

/** A chave manual em blocos de 4 — só na EXIBIÇÃO; copiar leva a chave inteira. */
export function blocosDaChave(chave: string): string {
  return (chave ?? "").replace(/\s+/g, "").replace(/(.{4})(?=.)/g, "$1 ");
}

/**
 * O nome do próximo aparelho.
 *
 * ⚠️ **O nome precisa ser ÚNICO na conta**: o Auth recusa um segundo
 * aplicativo com o mesmo nome (medido: `mfa_factor_name_conflict`, inclusive
 * com o nome vazio). O primeiro leva o nome simples; os seguintes, um número.
 */
export function nomeDoNovoAparelho(existentes: readonly string[]): string {
  const usados = new Set(existentes.map((n) => (n ?? "").trim().toLowerCase()));
  if (!usados.has(NOME_APARELHO.toLowerCase())) return NOME_APARELHO;
  for (let n = 2; n < 100; n++) {
    const nome = `${NOME_APARELHO} ${n}`;
    if (!usados.has(nome.toLowerCase())) return nome;
  }
  return `${NOME_APARELHO} ${existentes.length + 1}`;
}

/** Um aplicativo autenticador da conta, como a tela o mostra. */
export interface FatorDaConta {
  id: string;
  nome: string;
  /** Só o verificado protege a conta; o não verificado é um cadastro abandonado. */
  verificado: boolean;
  /** AAAA-MM-DD — o DIA no fuso de quem vê (`diaDoInstante`). */
  criadoEm: string;
}

/**
 * O dia (AAAA-MM-DD) de um INSTANTE, no fuso de quem vê.
 *
 * ⚠️ **Fatiar só vale para data pura.** O Auth devolve o instante em UTC com
 * `Z` (medido: "2026-10-07T22:20:57Z"), e fatiá-lo daria o dia de Greenwich:
 * um aparelho cadastrado às 21h30 em Brasília apareceria com a data de
 * amanhã. Data pura ("AAAA-MM-DD"), sem hora, continua fatiada — convertê-la
 * por `Date` a jogaria para o dia anterior em UTC−3.
 */
export function diaDoInstante(instante: string | null | undefined, fuso?: string): string {
  const t = (instante ?? "").trim();
  if (!t.includes("T")) return t.slice(0, 10);
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t.slice(0, 10);
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? "";
  return `${p("year")}-${p("month")}-${p("day")}`;
}

/** Traduz a lista do Auth para a tela, verificados primeiro. `fuso` só para a guarda — a tela usa o do navegador. */
export function fatoresParaTela(
  lista: readonly { id: string; friendly_name?: string | null; factor_type?: string; status?: string; created_at?: string }[],
  fuso?: string,
): FatorDaConta[] {
  return lista
    .filter((f) => (f.factor_type ?? "totp") === "totp")
    .map((f) => ({
      id: f.id,
      nome: (f.friendly_name ?? "").trim() || NOME_APARELHO,
      verificado: f.status === "verified",
      criadoEm: diaDoInstante(f.created_at, fuso),
    }))
    .sort((a, b) => Number(b.verificado) - Number(a.verificado) || a.criadoEm.localeCompare(b.criadoEm));
}
