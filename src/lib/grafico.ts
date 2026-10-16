/**
 * Os números do canvas "Quattro ERP · Gráficos e tabelas" que o CSS não
 * alcança: o Recharts recebe raio de barra e espessura por PROP. A cor e a
 * grade moram em `globals.css` (`--erp-graf-*`), nunca aqui.
 */
export const RAIO_BARRA = 6;
/** Barra vertical (topo arredondado). */
export const RAIO_TOPO: [number, number, number, number] = [RAIO_BARRA, RAIO_BARRA, 0, 0];
/** Barra vertical que cresce para BAIXO (saídas num gráfico divergente). */
export const RAIO_BASE: [number, number, number, number] = [0, 0, RAIO_BARRA, RAIO_BARRA];
/** Barra horizontal (ponta direita arredondada). */
export const RAIO_DIREITA: [number, number, number, number] = [0, RAIO_BARRA, RAIO_BARRA, 0];
/**
 * Linha de comparação (período anterior): areia, 0,6px, tracejada 2/2 — a
 * prancheta Biblioteca (14/10/2026). O traço vai por PROP porque o Recharts
 * escreve o atributo; o CSS de `--erp-graf-comparacao-*` é o espelho.
 */
export const COMPARACAO = { stroke: "var(--erp-graf-comparacao)", strokeDasharray: "2 2", strokeWidth: 0.6 } as const;
/** Espessura da linha principal (o CSS já a aplica; para quem passa por prop). */
export const ESPESSURA_LINHA = 1;
/** As cinco séries do canvas, na ordem. */
export const SERIES = [1, 2, 3, 4, 5].map((i) => `var(--erp-graf-serie-${i})`);
/**
 * Eixo Y curto em reais: R$ 6.000 · R$ 40k — sem estourar a largura do card.
 * O sinal vai escrito (− U+2212), nunca em cor.
 */
export function tickBRL(v: number): string {
  const abs = Math.abs(v);
  const s = abs >= 1000 ? `${(abs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: abs >= 10000 ? 0 : 1 })}k` : String(Math.round(abs));
  return `${v < 0 ? "\u2212" : ""}R$\u00A0${s}`; // não separável: o eixo do gráfico quebra no espaço comum
}
