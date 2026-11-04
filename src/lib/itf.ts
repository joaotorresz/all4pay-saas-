/**
 * O CÓDIGO DE BARRAS DO BOLETO — Intercalado 2 de 5 (ITF), o padrão FEBRABAN,
 * desenhado em SVG sem dependência (30/10/2026: a página do link de pagamento
 * passou a mostrar o boleto para escanear, como a Asaas).
 *
 * Cada PAR de dígitos vira um bloco: o primeiro nas BARRAS, o segundo nos
 * ESPAÇOS, cada um com 5 elementos, 2 largos e 3 estreitos. Começa com
 * estreita-estreita-estreita-estreita e termina com larga-estreita-estreita.
 *
 * ⚠️ A proporção larga ÷ estreita é 3 (a FEBRABAN aceita de 2,25 a 3): mais
 * estreita, a câmera do app do banco confunde larga com estreita. E a ZONA DE
 * SILÊNCIO (o branco dos lados) é parte do código: sem ela o leitor não acha
 * onde o código começa.
 */

const PADRAO = ["nnwwn", "wnnnw", "nwnnw", "wwnnn", "nnwnw", "wnwnn", "nwwnn", "nnnww", "wnnwn", "nwnwn"];
const LARGA = 3;
const SILENCIO = 10;

/** Os elementos do código, alternando barra e espaço, em módulos (1 = estreito). */
export function elementosITF(digitos: string): number[] {
  if (!/^\d+$/.test(digitos) || digitos.length % 2 !== 0) {
    throw new Error("O código ITF precisa de um número PAR de dígitos.");
  }
  const larg = (c: string) => (c === "w" ? LARGA : 1);
  const el: number[] = [1, 1, 1, 1];
  for (let i = 0; i < digitos.length; i += 2) {
    const barras = PADRAO[Number(digitos[i])];
    const espacos = PADRAO[Number(digitos[i + 1])];
    for (let k = 0; k < 5; k++) el.push(larg(barras[k]), larg(espacos[k]));
  }
  el.push(LARGA, 1, 1);
  return el;
}

/**
 * O SVG do código. `altura` e `modulo` em pixels; o SVG escala pela largura do
 * contêiner (`width="100%"`), mantendo a proporção. Fundo claro e barra na
 * tinta da paleta (as mesmas cores do QR do Pix): o leitor precisa de
 * contraste, em qualquer tema.
 */
export function itfParaSVG(digitos: string, { altura = 50, modulo = 1, rotulo = "Código de barras do boleto" } = {}): string {
  const el = elementosITF(digitos);
  const total = el.reduce((a, b) => a + b, 0) + 2 * SILENCIO;
  const rects: string[] = [];
  let x = SILENCIO;
  el.forEach((w, i) => {
    if (i % 2 === 0) rects.push(`<rect x="${x}" y="0" width="${w}" height="${altura / modulo}"/>`);
    x += w;
  });
  const largura = total * modulo;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${rotulo}" viewBox="0 0 ${total} ${altura / modulo}" ` +
    `width="100%" style="max-width:${largura}px;height:auto" preserveAspectRatio="none" shape-rendering="crispEdges">` +
    `<rect x="0" y="0" width="${total}" height="${altura / modulo}" fill="#F3F1EE"/>` +
    `<g fill="#3B4332">${rects.join("")}</g></svg>`
  );
}
