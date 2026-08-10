/**
 * DETECTOR DE SEGREDOS NO CHAT.
 *
 * "Não compartilhe senhas, tokens ou dados sensíveis" é um aviso que ninguém lê.
 * O que funciona é o sistema ver o segredo ANTES de ele sair do navegador e
 * dizer o que viu — com o trecho na tela, não com uma frase genérica.
 *
 * ⚠️ A regra que decide se isto presta: **não gritar lobo**. Um financeiro
 * escreve "R$1.234,56", "NF 000123456" e "movimento 4111111111111111"? Não —
 * mas escreve números o dia inteiro. Um detector que acusa qualquer sequência
 * longa treina a pessoa a ignorar o aviso, e aí o aviso deixou de existir.
 * Por isso todo detector aqui é ANCORADO e VALIDADO: cartão passa por Luhn,
 * CPF/CNPJ pelo dígito verificador, token por prefixo conhecido ou entropia.
 *
 * Puro, sem dependência.
 */

export type TipoSegredo =
  | "cartao" | "cpf" | "cnpj" | "token" | "jwt" | "senha" | "pix" | "boleto";

export interface AchadoSegredo {
  tipo: TipoSegredo;
  /** O trecho exato encontrado — a tela mostra para a pessoa reconhecer. */
  trecho: string;
  inicio: number;
  fim: number;
  rotulo: string;
}

const ROTULOS: Record<TipoSegredo, string> = {
  cartao: "número de cartão",
  cpf: "CPF",
  cnpj: "CNPJ",
  token: "chave de API ou token",
  jwt: "token JWT",
  senha: "senha",
  pix: "chave PIX aleatória",
  boleto: "linha digitável de boleto",
};

/* ------------------------------ verificadores ------------------------------ */

/** Luhn — o que separa um cartão de dezesseis dígitos quaisquer. */
export function luhn(digitos: string): boolean {
  if (digitos.length < 13 || digitos.length > 19) return false;
  let soma = 0;
  let alterna = false;
  for (let i = digitos.length - 1; i >= 0; i--) {
    let n = Number(digitos[i]);
    if (alterna) { n *= 2; if (n > 9) n -= 9; }
    soma += n;
    alterna = !alterna;
  }
  return soma % 10 === 0;
}

function dvCPF(d: string): boolean {
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (ate: number) => {
    let s = 0;
    for (let i = 0; i < ate; i++) s += Number(d[i]) * (ate + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

function dvCNPJ(d: string): boolean {
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (ate: number) => {
    const pesos = ate === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let s = 0;
    for (let i = 0; i < ate; i++) s += Number(d[i]) * pesos[i];
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

/**
 * Entropia de Shannon por caractere.
 *
 * É o que distingue `a4p_live_9f2c8b1e4d7a3f5e` de `contas-a-pagar-2026-08` —
 * os dois são longos, só um é aleatório. Sem isso, todo nome de arquivo com
 * hífen viraria "token detectado".
 */
export function entropia(s: string): number {
  const freq = new Map<string, number>();
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    freq.set(ch, (freq.get(ch) ?? 0) + 1);
  }
  let h = 0;
  Array.from(freq.values()).forEach((n) => {
    const p = n / s.length;
    h -= p * Math.log2(p);
  });
  return h;
}

/** Prefixos que declaram o que são — não precisam de heurística nenhuma. */
const PREFIXOS_TOKEN = [
  "a4p_live_", "a4p_test_", "mcp_", "sk_live_", "sk_test_", "pk_live_",
  "rk_live_", "ghp_", "github_pat_", "xoxb-", "xoxp-", "AKIA", "AIza",
];

/* -------------------------------- detecção -------------------------------- */

function empurrar(
  out: AchadoSegredo[], tipo: TipoSegredo, trecho: string, inicio: number,
): void {
  const fim = inicio + trecho.length;
  // Um trecho já coberto por outro achado não vira um segundo aviso: dizer
  // "cartão E token" sobre os mesmos dígitos confunde em vez de proteger.
  if (out.some((a) => inicio < a.fim && fim > a.inicio)) return;
  out.push({ tipo, trecho, inicio, fim, rotulo: ROTULOS[tipo] });
}

export function detectarSegredos(texto: string): AchadoSegredo[] {
  const t = texto ?? "";
  const out: AchadoSegredo[] = [];

  // 1. Senha DECLARADA — é o caso mais comum e o mais perigoso, porque a pessoa
  // escreve por vontade própria. Vem primeiro para vencer os outros detectores.
  for (const m of Array.from(t.matchAll(/\b(?:senha|password|pwd|passphrase)\s*(?:é|e|:|=|de acesso:?)?\s*["']?([^\s"',.;]{4,})/gi))) {
    if (m.index != null) empurrar(out, "senha", m[0], m.index);
  }

  // 2. JWT — três segmentos base64url separados por ponto. O formato é
  // inconfundível, não precisa de entropia.
  for (const m of Array.from(t.matchAll(/\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}\b/g))) {
    if (m.index != null) empurrar(out, "jwt", m[0], m.index);
  }

  // 3. Token com prefixo declarado + Bearer.
  for (const m of Array.from(t.matchAll(/\bBearer\s+[\w.\-]{16,}/gi))) {
    if (m.index != null) empurrar(out, "token", m[0], m.index);
  }
  for (const p of PREFIXOS_TOKEN) {
    let i = t.indexOf(p);
    while (i !== -1) {
      const resto = t.slice(i).match(/^[\w-]+/)?.[0] ?? p;
      if (resto.length >= p.length + 8) empurrar(out, "token", resto, i);
      i = t.indexOf(p, i + 1);
    }
  }

  // 4. Chave PIX aleatória (UUID) — identifica a conta de quem recebe.
  for (const m of Array.from(t.matchAll(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi))) {
    if (m.index != null) empurrar(out, "pix", m[0], m.index);
  }

  // 5. Sequências de dígitos: boleto → cartão → CNPJ → CPF, do mais longo ao
  // mais curto, para o de 47 dígitos não ser fatiado como três cartões.
  for (const m of Array.from(t.matchAll(/\d[\d.\s\/-]{10,}\d/g))) {
    if (m.index == null) continue;
    const bruto = m[0];
    const d = bruto.replace(/\D/g, "");
    let tipo: TipoSegredo | null = null;
    if (d.length === 47 || d.length === 44) tipo = "boleto";
    else if (dvCNPJ(d)) tipo = "cnpj";
    else if (dvCPF(d)) tipo = "cpf";
    else if (luhn(d)) tipo = "cartao";
    if (tipo) empurrar(out, tipo, bruto.trim(), m.index);
  }

  // 6. Token "cru": longo, sem espaço, com dígito e letra, e ENTRÓPICO. É o
  // último porque é o único que adivinha — e a barra é alta de propósito.
  for (const m of Array.from(t.matchAll(/\b[A-Za-z0-9_-]{24,}\b/g))) {
    if (m.index == null) continue;
    const s = m[0];
    if (!/\d/.test(s) || !/[A-Za-z]/.test(s)) continue;
    // ⚠️ Entropia sozinha NÃO basta: "contas-a-pagar-2026-08-31" tem 3,4
    // bits/char e é um nome de arquivo. O que separa um slug de um token é a
    // PONTUAÇÃO — nome legível usa hífen entre palavras, token não. Dois ou
    // mais separadores ⇒ é nome, não segredo. (Este falso positivo apareceu no
    // primeiro teste do detector; sem a trava, o aviso vira ruído e a pessoa
    // aprende a ignorá-lo — que é o mesmo que não ter aviso.)
    const separadores = (s.match(/[-_]/g) ?? []).length;
    if (separadores >= 2) continue;
    if (entropia(s) >= 3.4) empurrar(out, "token", s, m.index);
  }

  return out.sort((a, b) => a.inicio - b.inicio);
}

/**
 * Reescreve o texto com os segredos cobertos.
 *
 * ⚠️ Redige, não bloqueia. Impedir o envio faria a pessoa reescrever a mesma
 * mensagem por fora — o objetivo é que a dúvida chegue ao suporte SEM o
 * segredo, não que ela não chegue.
 */
export function redigirSegredos(texto: string, achados?: AchadoSegredo[]): string {
  const lista = (achados ?? detectarSegredos(texto)).slice().sort((a, b) => b.inicio - a.inicio);
  let out = texto;
  for (const a of lista) {
    out = out.slice(0, a.inicio) + `[${a.rotulo} removido]` + out.slice(a.fim);
  }
  return out;
}

export const temSegredo = (texto: string): boolean => detectarSegredos(texto).length > 0;
