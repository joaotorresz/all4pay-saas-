import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * all4pay DS — Badge
 * Tiny meta marker. `new` uses the lime accent (lime); `count` is
 * an ink pill with white text; `neutral` is a quiet surface chip.
 */
type BadgeVariant = "new" | "count" | "neutral";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  new: "bg-lime text-on-lime rounded-sm px-[6px] py-[2px] tracking-[0.03em]",
  count: "bg-ink text-white rounded-pill px-[7px] py-[1px] min-w-[18px]",
  neutral: "bg-surface-2 text-muted border border-border rounded-sm px-[7px] py-[2px]",
};

export function Badge({
  children,
  variant = "neutral",
  className,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center font-medium text-[13px] leading-[1.4]",
        variantClasses[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
