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
/** Linha de comparação (período anterior): areia, tracejada 5/5. */
export const COMPARACAO = { stroke: "var(--erp-graf-comparacao)", strokeDasharray: "5 5", strokeWidth: 1.4 } as const;
/** As cinco séries do canvas, na ordem. */
export const SERIES = [1, 2, 3, 4, 5].map((i) => `var(--erp-graf-serie-${i})`);
