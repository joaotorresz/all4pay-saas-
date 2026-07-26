"use client";

import * as React from "react";
import { useId } from "react";
import { Icon, InfoHint } from "@/components/ui";
import type { IconName, InfoConteudo } from "@/components/ui";

/** Bank brand dot colors (stand-ins for real logos). */
const BANK_COLORS: Record<string, string> = {
  itau: "#EC7000",
  bradesco: "#CC092F",
  nubank: "#820AD1",
  inter: "#FF7A00",
  santander: "#EC0000",
};
export const bankColor = (bank: string) => BANK_COLORS[bank] ?? "var(--color-text-secondary)";

/**
 * Ícone 3D da marca All4Pay — squircle com VOLUME: domo em lima (verde),
 * extrusão lateral (espessura), gloss especular e uma pastilha de acento
 * AMARELO. O glifo entra em PRETO (#11190C) sobre a lima. Verde + amarelo +
 * preto = a caracterização da marca. Profundidade 100% por gradiente/fill
 * (o sistema é "sem sombras"). Reutiliza os glifos flat existentes.
 */
export function Icon3D({ name, size = 40 }: { name: IconName | string; size?: number }) {
  const id = useId().replace(/:/g, "");
  const glyph = Math.round(size * 0.46);
  return (
    <span
      data-icontile=""
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 64 64" width={size} height={size} className="absolute inset-0">
        <defs>
          {/* domo: highlight no topo-esq → lima → profundo (volume esférico) */}
          <radialGradient id={`d-${id}`} cx="0.32" cy="0.24" r="0.95">
            <stop offset="0" stopColor="#F7FFC2" />
            <stop offset="0.5" stopColor="#E1FF00" />
            <stop offset="1" stopColor="#B4D200" />
          </radialGradient>
          {/* rim de luz no topo (bevel) */}
          <linearGradient id={`r-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.7" />
            <stop offset="0.3" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* extrusão (espessura): squircle atrás, deslocado p/ baixo */}
        <rect x="6" y="12" width="52" height="49" rx="16" fill="#93A800" />
        {/* face de topo com domo */}
        <rect x="6" y="4" width="52" height="49" rx="16" fill={`url(#d-${id})`} />
        {/* rim de luz no topo */}
        <rect x="6" y="4" width="52" height="22" rx="16" fill={`url(#r-${id})`} />
        {/* gloss especular (brilho topo-esq) */}
        <ellipse cx="22" cy="16" rx="12" ry="6" fill="#ffffff" opacity="0.42" />
        {/* pastilha de acento AMARELO (canto sup-dir) com glint */}
        <circle cx="50" cy="13" r="6.5" fill="#FFE500" />
        <ellipse cx="48" cy="11" rx="2.4" ry="1.5" fill="#ffffff" opacity="0.55" />
      </svg>
      {/* glifo PRETO sobre a lima */}
      <span className="relative flex items-center justify-center" style={{ marginTop: -1 }}>
        <Icon name={name} size={glyph} color="#11190C" />
      </span>
    </span>
  );
}

/** Alias de compat: o cabeçalho de card usa o ícone 3D da marca. */
export function IconTile({ name, size = 40 }: { name: IconName | string; size?: number }) {
  return <Icon3D name={name} size={size} />;
}

/** Section title for a widget, with an optional right-aligned slot. */
export function WidgetHeader({
  title,
  subtitle,
  action,
  info,
  icon,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  info?: InfoConteudo;
  icon?: IconName | string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-3 min-w-0">
        {icon && <IconTile name={icon} />}
        <div className="flex items-baseline gap-[10px] min-w-0">
          <h2 className="text-h3 font-medium text-ink truncate">{title}</h2>
          {info && <span className="self-center"><InfoHint align="left" {...info} /></span>}
          {subtitle && <span className="text-caption text-faint">{subtitle}</span>}
        </div>
      </div>
      {action}
    </div>
  );
}

/** Quiet empty state — icon, line, optional hint, optional CTA. Never alarming.
 *  O `action` fecha a correlação: um vazio nunca é um beco — sempre oferece o
 *  botão que o preenche (ex.: "Conectar banco", "Nova venda"). */
export function EmptyState({
  icon = "file-text",
  title,
  hint,
  action,
}: {
  icon?: IconName;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-8 px-4 gap-2">
      <span className="w-9 h-9 rounded-pill bg-surface-2 inline-flex items-center justify-center">
        <Icon name={icon} size={18} color="var(--color-text-tertiary)" />
      </span>
      <p className="m-0 text-label font-medium text-muted">{title}</p>
      {hint && <p className="m-0 text-caption text-faint max-w-[28ch]">{hint}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/** sr-only text so screen readers get the meaning of a visual figure. */
export function VisuallyHidden({ children }: { children: React.ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
