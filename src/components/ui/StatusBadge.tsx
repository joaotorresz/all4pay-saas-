import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Quattro DS — StatusBadge
 * Situação em PÍLULA com ponto (canvas "Quattro ERP · Gráficos e tabelas",
 * 14/10/2026): fundo da cor do status bem clarinho, ponto na cor cheia e o
 * TEXTO sempre em verde-base — a cor é o sinal, não a leitura.
 */
type StatusTone = "warning" | "neutral" | "positive" | "ink";

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
  icon?: React.ReactNode;
}

const toneColor: Record<StatusTone, string> = {
  warning: "var(--color-warning)",
  neutral: "var(--color-text-secondary)",
  positive: "var(--color-positive)",
  ink: "var(--color-ink)",
};
/** Fundo da pílula: a cor do status a 14% sobre o branco (neutro = cinza do card). */
const toneFundo = (tone: StatusTone, c: string) =>
  tone === "neutral" || tone === "ink"
    ? "var(--erp-menu-fundo)"
    : `color-mix(in srgb, ${c} 14%, var(--color-white))`;

export function StatusBadge({
  children,
  tone = "neutral",
  icon = null,
  className,
  style,
  ...rest
}: StatusBadgeProps) {
  const c = toneColor[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[6px] rounded-pill px-[10px] py-[4px] text-[12px] font-medium text-ink",
        className,
      )}
      style={{ background: toneFundo(tone, c), ...style }}
      {...rest}
    >
      {icon ? <span style={{ color: c }} className="inline-flex">{icon}</span> : (
        <span
          className="w-[6px] h-[6px] rounded-pill shrink-0"
          style={{ background: c }}
        />
      )}
      <span>{children}</span>
    </span>
  );
}
