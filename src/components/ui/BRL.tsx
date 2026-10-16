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
 * na mesma fonte e no mesmo corpo. Desde 16/10/2026 a vírgula e os CENTAVOS
 * também: `R$ 16.000,00`, tudo no mesmo corpo e cor.
 * Sempre `tabular-nums`.
 *
 * Diferente do <Money> (que usa px absolutos para os heróis grandes), o <BRL>
 * dimensiona o R$/decimais em `em` — então encaixa em qualquer font-size.
 */
export function BRL({
  value,
  prefix = "R$",
  showDecimals = true,
  compacto = false,
  className,
  style,
}: {
  value: number;
  prefix?: string;
  showDecimals?: boolean;
  /**
   * "R$ 312 mil" / "R$ 1,3 mi" — o valor ARREDONDADO à escala, com a unidade
   * menor e em cinza ao lado (canvas "Home · proposta snapshot"). Abaixo de
   * mil não há escala a dizer: sai o valor inteiro, sem centavos.
   */
  compacto?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  // Num escopo sem centavos o valor é ARREDONDADO, não truncado (ver SemCentavos).
  // `showDecimals={false}` também ARREDONDA: esconder a vírgula de 3.210,99
  // e mostrar "3.210" é truncar, e a soma das parcelas deixa de bater.
  const ctxSemCentavos = React.useContext(SemCentavosCtx);
  if (compacto) {
    const abs = Math.abs(value);
    const [num, unidade] =
      abs >= 1e6 ? [(abs / 1e6).toFixed(1).replace(".", ","), "mi"]
      : abs >= 1e3 ? [String(Math.round(abs / 1e3)), "mil"]
      : [brlParts(Math.round(abs)).integer, ""];
    return (
      <span className={cn("a4p-num inline-flex items-baseline whitespace-nowrap tabular-nums", className)} style={style}>
        <span>{value < 0 && num !== "0" ? "−" : ""}{prefix}{"\u00A0"}</span>
        <span>{num}</span>
        {unidade && (
          <span data-unidade="" className="text-muted" style={{ fontSize: "0.55em", marginLeft: "0.35em" }}>{unidade}</span>
        )}
      </span>
    );
  }
  const semCentavos = ctxSemCentavos || !showDecimals;
  const mostrado = semCentavos ? Math.round(value) : value;
  const neg = mostrado < 0;
  const { integer, decimals } = brlParts(mostrado);
  return (
    <span className={cn("a4p-num inline-flex items-baseline whitespace-nowrap tabular-nums", className)} style={style}>
      {/* ⚠️ O SINAL VEM ANTES DA MOEDA: −R$ 31.000, não R$−31.000. O menos
          qualifica o VALOR inteiro, não o algarismo — e no meio, entre a
          moeda e o número, ele se lê por um instante como parte da cifra. */}
      {/* `R$ 16.000,00`: espaço não separável entre a moeda e o número
          (design system de 16/10/2026). Mesma decisão no `Money`. */}
      <span>{neg ? "−" : ""}{prefix}{"\u00A0"}</span>
      <span>{integer}</span>
      {showDecimals && !semCentavos && (
        // `data-cents` permite a uma tela inteira esconder os centavos por CSS
        // (`.a4p-sem-centavos`), sem ter de passar showDecimals em cada uso.
        <span data-cents="">
          ,{decimals}
        </span>
      )}
    </span>
  );
}
