import * as React from "react";
import { cn } from "@/lib/utils";
import { brlParts } from "@/lib/format";

/**
 * all4pay DS — BRL (inline Money)
 * ------------------------------------------------------------
 * O mesmo tratamento do <Money> (★) porém INLINE e relativo ao contexto:
 * prefixo "R$" menor + faint · inteiro herói (herda cor/tamanho) · decimais
 * menores + faint. Sempre `tabular-nums`. Use no lugar de `<BRL value={x} />`
 * em qualquer exibição de valor (KPIs, listas, tooltips, captions).
 *
 * Diferente do <Money> (que usa px absolutos para os heróis grandes), o <BRL>
 * dimensiona o R$/decimais em `em` — então encaixa em qualquer font-size.
 */
export function BRL({
  value,
  prefix = "R$",
  showDecimals = true,
  className,
  style,
}: {
  value: number;
  prefix?: string;
  showDecimals?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const neg = value < 0;
  const { integer, decimals } = brlParts(value);
  return (
    <span className={cn("a4p-num inline-flex items-baseline whitespace-nowrap tabular-nums", className)} style={style}>
      <span className="text-placeholder font-medium" style={{ fontSize: "0.72em", marginRight: "0.16em" }}>
        {prefix}
      </span>
      <span>{neg ? "−" : ""}{integer}</span>
      {showDecimals && (
        <span className="text-placeholder" style={{ fontSize: "0.72em", marginLeft: "0.04em" }}>
          ,{decimals}
        </span>
      )}
    </span>
  );
}
