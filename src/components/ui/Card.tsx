import * as React from "react";
import { cn } from "@/lib/utils";
import { InfoHint, type InfoConteudo } from "./InfoHint";

/**
 * all4pay DS — Card
 * White surface, faint 1px border + whisper-soft shadow, 16px radius.
 * The default container for everything in the app.
 *
 * `info`: quando passado, renderiza o botão "i" universal no canto superior
 * direito (popover "para que serve" + "como é calculado"). Para cards que já
 * têm controles no topo-direito, use o <InfoHint> inline no header em vez da prop.
 */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  bordered?: boolean;
  elevated?: boolean;
  /** padding utility; pass `false` / "p-0" to remove. Defaults to 24px. */
  padded?: boolean;
  /** Botão "i" no canto (explica o box). */
  info?: InfoConteudo;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { children, bordered = false, elevated = true, padded = true, className, info, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      data-card="1"
      className={cn(
        // DS Visor: box branco, 14px, flat (sem borda/sombra), padding 24px.
        "bg-white rounded-card text-ink",
        info && "relative",
        bordered && "border border-border",
        elevated && "shadow-card",
        padded && "p-6",
        className,
      )}
      {...rest}
    >
      {info && (
        <div className="absolute top-3 right-3 z-10">
          <InfoHint {...info} />
        </div>
      )}
      {children}
    </div>
  );
});
