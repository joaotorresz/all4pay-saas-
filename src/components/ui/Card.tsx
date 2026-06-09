import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * all4pay DS — Card
 * White surface, faint 1px border + whisper-soft shadow, 16px radius.
 * The default container for everything in the app.
 */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  bordered?: boolean;
  elevated?: boolean;
  /** padding utility; pass `false` / "p-0" to remove. Defaults to 24px. */
  padded?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { children, bordered = true, elevated = true, padded = true, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "bg-white rounded-card text-ink",
        bordered && "border border-border",
        elevated && "shadow-card",
        padded && "p-6",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
});
