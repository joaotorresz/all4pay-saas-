"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { brlParts } from "@/lib/format";
import { SemCentavosCtx } from "./SemCentavos";

/**
 * Quattro DS — BRL (inline Money)
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
  // Num escopo sem centavos o valor é ARREDONDADO, não truncado (ver SemCentavos).
  // `showDecimals={false}` também ARREDONDA: esconder a vírgula de 3.210,99
  // e mostrar "3.210" é truncar, e a soma das parcelas deixa de bater.
  const semCentavos = React.useContext(SemCentavosCtx) || !showDecimals;
  const mostrado = semCentavos ? Math.round(value) : value;
  const neg = mostrado < 0;
  const { integer, decimals } = brlParts(mostrado);
  return (
    <span className={cn("a4p-num inline-flex items-baseline whitespace-nowrap tabular-nums", className)} style={style}>
      {/* ⚠️ O SINAL VEM ANTES DA MOEDA: −R$31.000, não R$−31.000. O menos
          qualifica o VALOR inteiro, não o algarismo — e no meio, entre a
          moeda e o número, ele se lê por um instante como parte da cifra. */}
      {/* Sem respiro entre a moeda e o número (`−R$31.000`): o prefixo é parte
          do valor, não um rótulo ao lado dele. Mesma decisão no `Money`. */}
      <span>{neg ? "−" : ""}{prefix}</span>
      <span>{integer}</span>
      {showDecimals && !semCentavos && (
        // `data-cents` permite a uma tela inteira esconder os centavos por CSS
        // (`.a4p-sem-centavos`), sem ter de passar showDecimals em cada uso.
        <span data-cents="" className="text-faint" style={{ fontSize: "0.72em", marginLeft: "0.04em" }}>
          ,{decimals}
        </span>
      )}
    </span>
  );
}
