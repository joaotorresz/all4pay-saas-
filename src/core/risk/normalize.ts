/**
 * Normalização + estatística do motor de crédito.
 * Tudo puro. Normalizar variáveis antes de ponderar evita que uma
 * escala (ex.: dias) domine outra (ex.: razão 0..1).
 */
import type { ClassificacaoRisco } from "./types";

export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Min-max → 0..1 (saturando fora do intervalo). */
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

/**
 * Função logística — transforma o score normalizado (0..1) em
 * probabilidade calibrada (centro em 0.5, inclinação k).
 */
export function logistica(x: number, k = 8, x0 = 0.5): number {
  return 1 / (1 + Math.exp(-k * (x - x0)));
}

/** Classificação por faixas (spec): baixo / moderado / alto / crítico. */
export function classificar(score: number): ClassificacaoRisco {
  if (score <= 20) return "baixo";
  if (score <= 50) return "moderado";
  if (score <= 75) return "alto";
  return "critico";
}
