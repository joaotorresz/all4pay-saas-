import * as React from "react";
import { cn } from "@/lib/utils";
import { brlParts } from "@/lib/format";

/**
 * all4pay DS — BRL (inline Money)
 * ------------------------------------------------------------
 * ⚠️ O PREFIXO "R$" TEM O MESMO TAMANHO, PESO E COR DO NÚMERO. Ele era menor
 * e `faint` — o tratamento-assinatura antigo. A moeda deixou de ser um
 * detalhe apagado ao lado do valor e passou a fazer parte dele: é uma peça só,
 * na mesma fonte e no mesmo corpo. Os CENTAVOS seguem menores, porque ali a
 * hierarquia é real (o inteiro é a informação, o centavo é o resto).
 * Sempre `tabular-nums`.
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
      {/* ⚠️ O SINAL VEM ANTES DA MOEDA: −R$ 31.000, não R$ −31.000. O menos
          qualifica o VALOR inteiro, não o algarismo — e no meio, entre a
          moeda e o número, ele se lê por um instante como parte da cifra. */}
      <span style={{ marginRight: "0.16em" }}>{neg ? "−" : ""}{prefix}</span>
      <span>{integer}</span>
      {showDecimals && (
        // `data-cents` permite a uma tela inteira esconder os centavos por CSS
        // (`.a4p-sem-centavos`), sem ter de passar showDecimals em cada uso.
        <span data-cents="" className="text-faint" style={{ fontSize: "0.72em", marginLeft: "0.04em" }}>
          ,{decimals}
        </span>
      )}
    </span>
  );
}
