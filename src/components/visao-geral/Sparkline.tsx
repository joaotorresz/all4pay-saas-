"use client";

import * as React from "react";

/**
 * Dashed ink sparkline with a soft area fill and an open endpoint —
 * extracted from the "Saldo total" balance card so its treatment can be
 * reused across the overview cards. Decorative: real meaning lives in the
 * card's number + aria text.
 */
export function Sparkline({
  series,
  height = 56,
  className,
}: {
  series: number[];
  height?: number;
  className?: string;
}) {
  const gid = React.useId();
  const W = 560;
  const H = height;
  const pad = 6;

  if (!series || series.length < 2) return null;

  const max = Math.max(...series);
  const min = Math.min(...series);
  const span = max - min || 1;
  const coords = series.map((v, i) => {
    const x = pad + (i / (series.length - 1)) * (W - pad * 2);
    const y = H - pad - ((v - min) / span) * (H - pad * 2);
    return [x, y] as const;
  });
  const d = coords
    .map((c, i) => (i ? "L" : "M") + c[0].toFixed(1) + " " + c[1].toFixed(1))
    .join(" ");
  const area = `${d} L ${coords[coords.length - 1][0].toFixed(1)} ${H} L ${coords[0][0].toFixed(1)} ${H} Z`;
  const last = coords[coords.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`spark-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-lime)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--color-lime)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${gid})`} stroke="none" />
      <path
        d={d}
        fill="none"
        stroke="var(--color-chart-line)"
        strokeWidth="1.4"
        strokeDasharray="5 4"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={last[0]}
        cy={last[1]}
        r="4"
        fill="var(--color-white)"
        stroke="var(--color-chart-line)"
        strokeWidth="1.6"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
