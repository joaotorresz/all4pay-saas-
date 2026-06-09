import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * all4pay DS — StatusBadge
 * Status as icon + text, NOT a filled colored pill. Color is quiet and
 * tied to the icon: amber for issues, neutral ink for review, a muted
 * green for cleared. Default uses a small dot as the icon.
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
        "inline-flex items-center gap-[6px] text-label font-medium",
        className,
      )}
      style={{ color: c, ...style }}
      {...rest}
    >
      {icon || (
        <span
          className="w-[7px] h-[7px] rounded-pill shrink-0"
          style={{ background: c }}
        />
      )}
      <span>{children}</span>
    </span>
  );
}
