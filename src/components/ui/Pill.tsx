import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * all4pay DS — Pill
 * Floating contextual chip / micro-CTA. `yield` is the desaturated lime
 * "Render mais ↗" chip; `surface` is the quiet floating action (soft
 * shadow); `muted` and `ghost` are quieter still.
 */
type PillVariant = "yield" | "surface" | "muted" | "ghost";

export interface PillProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PillVariant;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantClasses: Record<PillVariant, string> = {
  yield: "bg-lime-tint text-ink border border-[#EAF59A]",
  surface: "bg-white text-ink border border-border shadow-pill",
  muted: "bg-surface-2 text-muted border border-border",
  ghost: "bg-transparent text-ink border border-transparent",
};

export const Pill = React.forwardRef<HTMLButtonElement, PillProps>(function Pill(
  { children, variant = "surface", leftIcon = null, rightIcon = null, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center gap-[6px] font-medium text-label leading-none",
        "px-3 py-[6px] rounded-pill whitespace-nowrap",
        variantClasses[variant],
        className,
      )}
      {...rest}
    >
      {leftIcon}
      {children}
      {rightIcon}
    </button>
  );
});
