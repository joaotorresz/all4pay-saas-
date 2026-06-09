/** Helpers estatísticos da camada quantitativa (puros). */

export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function normalizar(valor: number, min: number, max: number): number {
  if (max <= min) return 0;
  return clamp01((valor - min) / (max - min));
}

export function media(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function desvioPadrao(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = media(xs);
  return Math.sqrt(media(xs.map((x) => (x - m) ** 2)));
}

/** Coeficiente de variação (instabilidade relativa). */
export function coefVariacao(xs: number[]): number {
  const m = Math.abs(media(xs));
  if (m === 0) return 0;
  return desvioPadrao(xs) / m;
}
