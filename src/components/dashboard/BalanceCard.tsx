"use client";

import * as React from "react";
import { Card, Pill, Money, Icon } from "@/components/ui";

/** Hero balance card: the big Money value + a dashed sparkline chart. */
export function BalanceCard() {
  // Simple normalized series -> path
  const pts = [12, 18, 15, 22, 28, 26, 34, 40, 38, 46, 52, 49, 58];
  const W = 560,
    H = 132,
    pad = 6;
  const max = Math.max(...pts),
    min = Math.min(...pts);
  const coords = pts.map((v, i) => {
    const x = pad + (i / (pts.length - 1)) * (W - pad * 2);
    const y = H - pad - ((v - min) / (max - min)) * (H - pad * 2);
    return [x, y] as const;
  });
  const d = coords
    .map((c, i) => (i ? "L" : "M") + c[0].toFixed(1) + " " + c[1].toFixed(1))
    .join(" ");
  const area =
    d +
    ` L ${coords[coords.length - 1][0].toFixed(1)} ${H} L ${coords[0][0].toFixed(1)} ${H} Z`;
  const last = coords[coords.length - 1];
  const months = ["Nov", "Dez", "Jan", "Fev", "Mar", "Abr"];
  const gridX = months.map(
    (_, i) => pad + (i / (months.length - 1)) * (W - pad * 2),
  );

  return (
    <Card padded={false} className="overflow-hidden relative">
      <div className="absolute top-5 right-5">
        <Pill variant="surface" leftIcon={<Icon name="arrow-up" size={14} />}>
          Mover da Tesouraria
        </Pill>
      </div>

      <div className="flex justify-between items-start gap-4 px-6 pt-6 pb-2">
        <div>
          <div className="text-label font-medium text-muted">Saldo total</div>
          <div className="mt-2">
            <Money
              integer="2.159.450"
              decimals="00"
              size={44}
              integerWeight={500}
              prefixSize={18}
              prefixWeight={400}
            />
          </div>
          <div className="flex items-center gap-[6px] mt-3 text-label tabular-nums">
            <Icon name="arrow-up-right" size={14} color="var(--color-positive)" />
            <span className="text-positive font-medium">+4,2%</span>
            <span className="text-faint">vs. últimos 30 dias</span>
          </div>
        </div>
      </div>

      <div className="px-3 pb-[14px] pt-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          preserveAspectRatio="none"
          className="block"
        >
          <defs>
            <linearGradient id="bcArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-ink)" stopOpacity="0.10" />
              <stop offset="100%" stopColor="var(--color-ink)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {gridX.map((x, i) => (
            <line
              key={i}
              x1={x}
              y1="0"
              x2={x}
              y2={H}
              stroke="var(--color-border-soft)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path d={area} fill="url(#bcArea)" stroke="none" />
          <path
            d={d}
            fill="none"
            stroke="var(--color-ink)"
            strokeWidth="2"
            strokeDasharray="5 4"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <circle
            cx={last[0]}
            cy={last[1]}
            r="4"
            fill="var(--color-white)"
            stroke="var(--color-ink)"
            strokeWidth="1.6"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="flex justify-between px-[6px] text-[11px] text-faint tabular-nums">
          {months.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>
      </div>
    </Card>
  );
}
