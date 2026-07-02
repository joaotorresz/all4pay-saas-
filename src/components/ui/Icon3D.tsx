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
export type Icon3DName =
  | "money" | "chart" | "card" | "calendar" | "wallet" | "bank" | "spark" | "doc"
  | "users" | "box" | "tag" | "cart" | "layers" | "repeat" | "shield" | "gauge" | "gear" | "target";
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
  users: <g><circle cx="25" cy="24" r="6" fill="none" strokeWidth="4" /><path d="M15 44c0-6 4.5-10 10-10s10 4 10 10" fill="none" strokeWidth="4" strokeLinecap="round" /><path d="M39 20a5.5 5.5 0 010 11M43 44c0-5-2.5-8.5-6-10" fill="none" strokeWidth="4" strokeLinecap="round" /></g>,
  box: <g><path d="M32 15l14 8v14l-14 8-14-8V23z" fill="none" strokeWidth="4" strokeLinejoin="round" /><path d="M18 23l14 8 14-8M32 31v16" strokeWidth="4" strokeLinejoin="round" /></g>,
  tag: <g><path d="M17 17h13l17 17-13 13-17-17z" fill="none" strokeWidth="4" strokeLinejoin="round" /><circle cx="26" cy="26" r="3" /></g>,
  cart: <g><path d="M15 17h5l4 20h18l4-14H22" fill="none" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /><circle cx="26" cy="45" r="2.5" /><circle cx="42" cy="45" r="2.5" /></g>,
  layers: <g><path d="M32 14l18 9-18 9-18-9z" fill="none" strokeWidth="4" strokeLinejoin="round" /><path d="M14 32l18 9 18-9" strokeWidth="4" strokeLinejoin="round" /></g>,
  repeat: <g><path d="M18 26a14 14 0 0124-8m2-6v10H34" fill="none" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /><path d="M46 38a14 14 0 01-24 8m-2 6V42h10" fill="none" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></g>,
  shield: <g><path d="M32 14l16 6v11c0 10-7 16-16 19-9-3-16-9-16-19V20z" fill="none" strokeWidth="4" strokeLinejoin="round" /><path d="M25 31l5 5 9-10" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></g>,
  gauge: <g><path d="M15 40a17 17 0 0134 0" fill="none" strokeWidth="4" strokeLinecap="round" /><path d="M32 40l9-9" strokeWidth="4" strokeLinecap="round" /><circle cx="32" cy="40" r="3" /></g>,
  gear: <g><circle cx="32" cy="32" r="6" fill="none" strokeWidth="4" /><path d="M32 14v6M32 44v6M14 32h6M44 32h6M19 19l4 4M41 41l4 4M45 19l-4 4M23 41l-4 4" strokeWidth="4" strokeLinecap="round" /></g>,
  target: <g><circle cx="32" cy="32" r="15" fill="none" strokeWidth="4" /><circle cx="32" cy="32" r="7" fill="none" strokeWidth="4" /><circle cx="32" cy="32" r="1.5" /></g>,
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
  const glyph = isInk ? "var(--color-lime)" : "#11190C";
  // Paleta 3D (domo com gloss): claro no topo-esq → profundo no fundo-dir, +
  // face lateral (extrusão) para espessura real. Cores exatas da marca.
  const hi = isInk ? "#33421f" : "#F6FFC0";   // realce claro (topo-esq)
  const mid = isInk ? "#1a2512" : "#DCFF00";  // lime da marca (meio)
  const lo = isInk ? "#0c1207" : "#A9CC00";   // profundo (fundo-dir)
  const side = isInk ? "#04060a" : "#8FAD00"; // extrusão (mais escura)

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title ?? name} className={className}>
      <defs>
        {/* domo: radial deslocado p/ topo-esq → sensação de volume esférico */}
        <radialGradient id={`f-${id}`} cx="0.32" cy="0.26" r="0.9">
          <stop offset="0" stopColor={hi} />
          <stop offset="0.55" stopColor={mid} />
          <stop offset="1" stopColor={lo} />
        </radialGradient>
        {/* rim de luz no topo (bevel) */}
        <linearGradient id={`r-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity={isInk ? 0.14 : 0.6} />
          <stop offset="0.28" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* extrusão (espessura): squircle atrás, deslocado p/ baixo */}
      <rect x="5" y="12" width="54" height="49" rx="17" fill={side} />
      {/* face de topo com gradiente-domo */}
      <rect x="5" y="4" width="54" height="49" rx="17" fill={`url(#f-${id})`} />
      {/* bevel/rim de luz no topo */}
      <rect x="5" y="4" width="54" height="22" rx="17" fill={`url(#r-${id})`} />
      {/* specular highlight (gloss) — pequeno brilho no topo-esq */}
      <ellipse cx="20" cy="16" rx="12" ry="6.5" fill="#ffffff" opacity={isInk ? 0.12 : 0.4} />
      {/* glifo (no plano do topo) */}
      <g fill={glyph} stroke={glyph} strokeWidth="0" transform="translate(0,-2.5)">
        {GLYPHS[name]}
      </g>
      {/* acento amarelo (só no duo) — pastilha com brilho */}
      {variant === "duo" && (
        <g>
          <circle cx="50" cy="13" r="6.5" fill="#FFE500" />
          <ellipse cx="48" cy="11" rx="2.6" ry="1.6" fill="#ffffff" opacity="0.5" />
        </g>
      )}
    </svg>
  );
}
