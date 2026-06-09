import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * all4pay DS — Skeleton
 * Quiet loading placeholder: a surface-2 block with a soft pulse.
 * Use per-widget so the page never blocks as a whole.
 */
export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Tailwind rounding token; defaults to `rounded-sm`. */
  rounded?: "sm" | "md" | "card" | "pill" | "none";
}

const roundedClass: Record<NonNullable<SkeletonProps["rounded"]>, string> = {
  sm: "rounded-sm",
  md: "rounded-md",
  card: "rounded-card",
  pill: "rounded-pill",
  none: "",
};

export function Skeleton({
  rounded = "sm",
  className,
  ...rest
}: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "bg-surface-2 animate-pulse",
        roundedClass[rounded],
        className,
      )}
      {...rest}
    />
  );
}
