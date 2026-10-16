/**
 * Fidelidade da REDAÇÃO da IA (16/10/2026).
 *
 * Quando o motor nativo já calculou a resposta, o Claude só a REESCREVE no
 * tom da Quattro AI (curto, direto, com negrito). Reescrever não pode mudar
 * número: todo número da versão nova tem de existir na resposta do motor ou
 * nos seus destaques. Se um só não existir, vale o texto do motor — uma frase
 * bonita com um valor trocado é pior que uma frase seca com o valor certo.
 */

/** Os números de um texto, normalizados ("R$ 1.234,50" → "1234,5"; "12%" → "12"). */
export function numerosDoTexto(texto: string): string[] {
  const achados = texto.replace(/\*\*/g, "").match(/\d[\d.,]*/g) ?? [];
  return achados.map(normalizar).filter((n) => n !== "");
}

function normalizar(bruto: string): string {
  let s = bruto.replace(/[.,]+$/, "");
  // "1.234,56" → milhar com ponto, decimal com vírgula (pt-BR).
  s = s.replace(/\.(?=\d{3}(\D|$))/g, "");
  if (s.includes(",")) {
    const [int, dec] = s.split(",");
    const d = (dec ?? "").replace(/0+$/, "");
    s = d ? `${int},${d}` : int;
  }
  return s.replace(/^0+(?=\d)/, "");
}

/**
 * A redação nova só vale se TODO número dela estiver na base. Devolve a lista
 * do que sobrou (vazia = fiel), para o chamador poder registrar o motivo.
 */
export function numerosInventados(nova: string, base: string[]): string[] {
  const permitidos = new Set(base.flatMap(numerosDoTexto));
  return Array.from(new Set(numerosDoTexto(nova).filter((n) => !permitidos.has(n))));
}
