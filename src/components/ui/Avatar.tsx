import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * all4pay DS — Avatar
 * Circular identity token. Initials on a quiet surface by default, or an
 * image. Used in the nav footer, table rows and account menus.
 */
export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  name?: string;
  src?: string | null;
  size?: number;
  square?: boolean;
}

export function Avatar({
  name = "",
  src = null,
  size = 32,
  square = false,
  className,
  style,
  ...rest
}: AvatarProps) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center shrink-0 overflow-hidden select-none",
        "bg-surface-3 border border-border text-ink font-medium leading-none",
        square ? "rounded-sm" : "rounded-pill",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4), ...style }}
      {...rest}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="w-full h-full object-cover" />
      ) : (
        initials || "·"
      )}
    </span>
  );
}
