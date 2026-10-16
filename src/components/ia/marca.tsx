"use client";

import * as React from "react";

/* ============================== MARCA ============================== */

/**
 * O "4" da marca — o raio do wordmark Quattro, vetorizado do próprio
 * `public/all4pay-dark.png`; o mesmo path vive em `public/all4pay-4.svg`.
 */
export const PATH_4 = "M39.3 0L64.32 0.29L34.06 53.95L61.56 54.61L74.5 31.49L98.95 31.97L60.99 99.81L36.06 100L53.38 68.98L1.05 68.6Z";

export const GRAD_MARCA = "var(--gradient-marca)";
/** Faixa larga do mesmo degradê + `a4p-onda` = a onda entre as cores. */
export const GRAD_ONDA = "var(--gradient-marca-onda)";

/** O "4" em degradê lime→verde (tile do FAB). Id único por instância. */
export function Marca4({ size = 18 }: { size?: number }) {
  const id = React.useId();
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--color-lime)" />
          <stop offset="1" stopColor="var(--a4p-cat-3)" />
        </linearGradient>
      </defs>
      <path fill={`url(#${id})`} d={PATH_4} />
    </svg>
  );
}

/**
 * A logo da IA — o MESMO "4" da marca girado 90°, em branco sobre o degradê
 * lima. É a marca que identifica o assistente (cabeçalho, estado vazio,
 * cada análise).
 */
export function MarcaIA({ size = 28, radius = 8 }: { size?: number; radius?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size, borderRadius: radius, backgroundImage: GRAD_MARCA }}
      aria-hidden
    >
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 100 100">
        <g transform="rotate(90 50 50)">
          <path fill="var(--color-white)" d={PATH_4} />
        </g>
      </svg>
    </span>
  );
}

