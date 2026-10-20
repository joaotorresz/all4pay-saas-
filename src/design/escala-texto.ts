/**
 * Escala de texto — o tamanho de TODO texto do sistema num número só
 * (decisão do dono, 20/10/2026: +20%).
 *
 * ⚠️ ESTE é o lugar do fator. O PostCSS (`postcss-escala-texto.cjs`) o lê
 * deste arquivo e multiplica todo `font-size`, `line-height` e
 * `letter-spacing` em px do CSS gerado; o que nasce em JS (eixo de gráfico
 * do Recharts, `<text>` de SVG, `Money`, estilo inline) passa por `tx()`.
 * Mudar o tamanho de todo texto é mudar a linha abaixo — e só ela.
 */
export const ESCALA_TEXTO: number = 1.2;

/** Tamanho de texto em px já escalado (arredondado a 0,01px). */
export function tx(px: number): number {
  return Math.round(px * ESCALA_TEXTO * 100) / 100;
}
