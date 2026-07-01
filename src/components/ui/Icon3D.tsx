import * as React from "react";
import { useId } from "react";

/**
 * all4pay DS — Icon3D (ícone "3D" nativo da marca, EXTRUDADO)
 *
 * Volume real por EXTRUSÃO (face de topo + face lateral mais escura) + sheen —
 * tudo por preenchimento, nunca por sombra (respeita a regra "sem sombras").
 * Cores 100% da marca (lime + verde profundo + preto-marca #11190C) → casa com
 * o site corporativo, o que PNGs de terceiros não permitem sem re-render.
 * Vetorial, nítido, theme-aware, sem licença.
 *
 * Estilos:
 *  - "duo"  : topo lime · glifo preto · acento amarelo   (padrão da marca)
 *  - "lime" : topo lime · glifo preto
 *  - "ink"  : topo preto · glifo lime
 */
export type Icon3DName = "money" | "chart" | "card" | "calendar" | "wallet" | "bank" | "spark" | "doc";
export type Icon3DStyle = "duo" | "lime" | "ink";

const GLYPHS: Record<Icon3DName, React.ReactNode> = {
  money: <path d="M32 15v5m0 22v5m6-24c0-3.3-2.7-5-6-5s-6 1.7-6 5 2.7 4.5 6 5.5 6 2.2 6 5.5-2.7 5-6 5-6-1.7-6-5" fill="none" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />,
  chart: <g><rect x="18" y="29" width="6" height="16" rx="2" /><rect x="29" y="21" width="6" height="24" rx="2" /><rect x="40" y="25" width="6" height="20" rx="2" /></g>,
  card: <g><rect x="16" y="20" width="32" height="23" rx="5" fill="none" strokeWidth="4" /><path d="M16 28h32" strokeWidth="4" /><path d="M22 37h8" strokeWidth="4" strokeLinecap="round" /></g>,
  calendar: <g><rect x="16" y="18" width="32" height="27" rx="5" fill="none" strokeWidth="4" /><path d="M16 26h32M24 14v6M40 14v6" strokeWidth="4" strokeLinecap="round" /><circle cx="27" cy="36" r="2.5" /></g>,
  wallet: <g><rect x="15" y="19" width="34" height="23" rx="5" fill="none" strokeWidth="4" /><path d="M40 28h6v6h-6a3 3 0 010-6z" /></g>,
  bank: <g><path d="M16 25l16-9 16 9" fill="none" strokeWidth="4" strokeLinejoin="round" /><path d="M20 27v13M28 27v13M36 27v13M44 27v13M15 44h34" strokeWidth="4" strokeLinecap="round" /></g>,
  spark: <path d="M32 14c1.5 8 3 9.5 11 11-8 1.5-9.5 3-11 11-1.5-8-3-9.5-11-11 8-1.5 9.5-3 11-11z" strokeLinejoin="round" />,
  doc: <g><path d="M20 14h16l10 10v22H20z" fill="none" strokeWidth="4" strokeLinejoin="round" /><path d="M36 14v10h10M26 32h12M26 39h12" strokeWidth="4" strokeLinecap="round" /></g>,
};

export interface Icon3DProps {
  name: Icon3DName;
  size?: number;
  variant?: Icon3DStyle;
  className?: string;
  title?: string;
}

export function Icon3D({ name, size = 44, variant = "duo", className, title }: Icon3DProps) {
  const id = useId().replace(/:/g, "");
  const isInk = variant === "ink";
  const face = isInk ? `url(#f-${id})` : `url(#f-${id})`;
  const glyph = isInk ? "var(--color-lime)" : "#11190C";
  const sheen = isInk ? "rgba(220,255,0,0.12)" : "rgba(255,255,255,0.55)";
  // faces do gradiente (topo → base) e a lateral (extrusão) mais escura
  const faceTop = isInk ? "#20301a" : "#EAFF7A";
  const faceBot = isInk ? "#0c1207" : "#CBEE00";
  const side = isInk ? "#05080a" : "#A6C400";

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title ?? name} className={className}>
      <defs>
        <linearGradient id={`f-${id}`} x1="0" y1="0" x2="0.15" y2="1">
          <stop offset="0" stopColor={faceTop} />
          <stop offset="1" stopColor={faceBot} />
        </linearGradient>
        <linearGradient id={`s-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sheen} />
          <stop offset="1" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
      {/* extrusão (face lateral, atrás e deslocada p/ baixo → dá espessura 3D) */}
      <rect x="4" y="10" width="56" height="52" rx="18" fill={side} />
      {/* topo */}
      <rect x="4" y="3" width="56" height="52" rx="18" fill={face} />
      {/* sheen (brilho no topo, não sombra) */}
      <rect x="4" y="3" width="56" height="26" rx="18" fill={`url(#s-${id})`} />
      {/* glifo (no plano do topo) */}
      <g fill={glyph} stroke={glyph} strokeWidth="0" transform="translate(0,-3)">
        {GLYPHS[name]}
      </g>
      {/* acento amarelo (só no duo) */}
      {variant === "duo" && <circle cx="50" cy="12" r="6" fill="#FFE500" />}
    </svg>
  );
}
