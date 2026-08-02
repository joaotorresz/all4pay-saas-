/**
 * CODIFICAÇÃO WINDOWS-1252 (ANSI) — sem dependência.
 *
 * ⚠️ Esta é a diferença entre um TXT que o Domínio importa e um que ele importa
 * ERRADO em silêncio. O Domínio é um sistema Windows e lê o arquivo como ANSI;
 * um arquivo UTF-8 faz cada acento chegar como dois caracteres de lixo —
 * "Manutenção" vira "ManutenÃ§Ã£o" no histórico de TODOS os lançamentos. O
 * arquivo importa, os valores batem, e a escrituração fica ilegível.
 *
 * O `TextEncoder` do navegador só sabe UTF-8 (é o que a especificação manda),
 * então a tabela vem à mão. Windows-1252 é Latin-1 em quase toda a extensão; a
 * diferença mora na faixa 0x80–0x9F, onde o Latin-1 tem controles e o 1252 tem
 * tipografia (aspas curvas, travessão, reticências) — justamente o que aparece
 * num histórico copiado e colado.
 */

/** Os 32 caracteres em que o CP-1252 diverge do Latin-1 (0x80–0x9F). */
const FAIXA_ALTA: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87,
  "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e,
  "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94,
  "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a,
  "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};

/**
 * O que não cabe em 1252 é TRANSLITERADO, não descartado.
 *
 * Um "?" no meio do histórico é ruído que o contador não sabe decifrar; tirar o
 * acento mantém a palavra legível. Só o que sobra depois disso (emoji, símbolo
 * de outro alfabeto) vira "?" — e aí o "?" é a informação honesta de que ali
 * havia algo que este formato não carrega.
 */
function transliterar(ch: string): number {
  const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const c = base.charCodeAt(0);
  return base.length === 1 && c >= 0x20 && c <= 0x7e ? c : 0x3f; // "?"
}

export function paraCP1252(texto: string): Uint8Array {
  const out = new Uint8Array(texto.length * 2);
  let n = 0;
  for (const ch of texto) {
    const cp = ch.codePointAt(0)!;
    if (cp <= 0x7f || (cp >= 0xa0 && cp <= 0xff)) out[n++] = cp;
    else if (FAIXA_ALTA[ch] != null) out[n++] = FAIXA_ALTA[ch];
    else out[n++] = transliterar(ch);
  }
  return out.slice(0, n);
}

/** Só para conferência/teste: volta os bytes para texto. */
export function deCP1252(bytes: Uint8Array): string {
  const inverso = new Map(Object.entries(FAIXA_ALTA).map(([k, v]) => [v, k]));
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += inverso.get(bytes[i]) ?? String.fromCharCode(bytes[i]);
  }
  return s;
}
