"use client";

import * as React from "react";
import { Money, Icon } from "@/components/ui";
import { Sparkline } from "./Sparkline";
import { VisuallyHidden } from "./shared";

/**
 * The "Saldo total" hero treatment, generalized.
 * Label · big Money (44px, weight 500, faint R$ prefix at 18px) · an
 * optional delta/context line · an optional dashed sparkline. Reused
 * across the overview cards so they share that signature balance look.
 */
type DeltaTone = "positive" | "negative" | "muted";

export function HeroValue({
  label,
  integer,
  decimals,
  color = "var(--color-ink)",
  size = 26,
  delta,
  sparkline,
  rightSlot,
  srValue,
}: {
  label: string;
  integer: string;
  decimals: string;
  color?: string;
  size?: number;
  delta?: { dir?: "up" | "down"; value: string; context?: string; tone?: DeltaTone };
  sparkline?: number[];
  rightSlot?: React.ReactNode;
  srValue?: string;
}) {
  const deltaColor =
    delta?.tone === "negative"
      ? "var(--color-negative)"
      : delta?.tone === "muted"
        ? "var(--color-text-secondary)"
        : "var(--color-positive)";

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        {/* Rótulo do herói (Laboratório): Roobert Variable 12, peso 200. */}
        <div className="text-muted" style={{ fontFamily: '"Roobert Variable", "Roobert", sans-serif', fontSize: 12, fontWeight: 200 }}>{label}</div>
        {rightSlot}
      </div>

      <div className="mt-2">
        <Money
          integer={integer}
          decimals={decimals}
          size={size}
          integerWeight={500}
          prefixSize={size}
          prefixWeight={500}
          prefixColor="#000000"
          color={color}
        />
        {srValue && <VisuallyHidden>{srValue}</VisuallyHidden>}
      </div>

      {delta && (
        <div className="flex items-center gap-[6px] mt-3 text-label tabular-nums">
          {delta.dir && (
            <Icon
              name={delta.dir === "down" ? "arrow-up-right" : "arrow-up-right"}
              size={14}
              color={deltaColor}
              className={delta.dir === "down" ? "rotate-90" : undefined}
            />
          )}
          <span style={{ color: deltaColor }} className="font-medium">
            {delta.value}
          </span>
          {delta.context && (
            <span className="text-faint">{delta.context}</span>
          )}
        </div>
      )}

      {sparkline && sparkline.length > 1 && (
        <div className="mt-3 -mx-1">
          <Sparkline series={sparkline} height={52} />
        </div>
      )}
    </div>
  );
}
