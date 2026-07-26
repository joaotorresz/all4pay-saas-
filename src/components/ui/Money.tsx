import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * all4pay DS — Money  ★ the product's signature treatment
 * ------------------------------------------------------------
 * Three emphasis zones: a small faint currency prefix · a large ink
 * integer · small faint decimals. ALWAYS tabular-nums so columns align
 * and updating values don't shiver. Defaults to pt-BR (R$ · "," sep).
 *
 * The number is the hero — keep everything around it quiet.
 */
type MoneySize = "display" | "lg" | "md" | "sm";

export interface MoneyProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Currency prefix shown in faint grey (e.g. "R$", "US$", "€"). */
  currency?: string;
  /** Integer part, already grouped (e.g. "2.159.450"). */
  integer: string;
  /** Decimal digits without separator (e.g. "00"). */
  decimals?: string;
  /** Named size or a raw px number for the integer. */
  size?: MoneySize | number;
  showDecimals?: boolean;
  color?: string;
  integerWeight?: 400 | 500;
  prefixSize?: number;
  prefixWeight?: 400 | 500;
  decimalSep?: string;
}

const SIZE_PX: Record<MoneySize, number> = { display: 62, lg: 38, md: 29, sm: 22 };

export function Money({
  currency = "R$",
  integer,
  decimals = "00",
  size = "lg",
  showDecimals = true,
  color = "var(--color-ink)",
  integerWeight = 400,
  prefixSize,
  prefixWeight = 500,
  decimalSep = ",",
  className,
  style,
  ...rest
}: MoneyProps) {
  const px = typeof size === "number" ? size : SIZE_PX[size];
  const curPx = prefixSize != null ? prefixSize : Math.round(px * 0.44);

  return (
    <span
      className={cn(
        // a4p-num: valores monetários entram em MONO (DS Ledger, globals.css)
        "a4p-num inline-flex items-baseline whitespace-nowrap leading-none tabular-nums",
        className,
      )}
      style={{ letterSpacing: "-0.01em", ...style }}
      {...rest}
    >
      <span
        className="text-placeholder mr-[5px]"
        style={{ fontSize: curPx, fontWeight: prefixWeight }}
      >
        {currency}
      </span>
      <span style={{ fontSize: px, color, fontWeight: integerWeight }}>
        {integer}
      </span>
      {showDecimals && (
        <span
          className="text-placeholder ml-px font-regular"
          style={{ fontSize: Math.round(px * 0.4) }}
        >
          {decimalSep}
          {decimals}
        </span>
      )}
    </span>
  );
}
