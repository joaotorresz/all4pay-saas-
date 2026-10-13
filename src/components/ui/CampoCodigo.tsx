"use client";

import * as React from "react";
import { Input } from "./Input";
import { DIGITOS_CODIGO, normalizarCodigo } from "@/core/segundo-fator";

/**
 * Quattro DS — CampoCodigo
 *
 * O campo do código de 6 dígitos do aplicativo autenticador: no cadastro, no
 * passo da entrada e onde mais um código for pedido. Um primitivo e não três
 * `Input` configurados à mão, porque os detalhes que o fazem funcionar no
 * telefone são fáceis de esquecer numa cópia:
 *
 *   · `inputMode="numeric"` abre o teclado numérico;
 *   · `autoComplete="one-time-code"` deixa o sistema sugerir o código;
 *   · o que se digita passa por `normalizarCodigo` (espaço e hífen somem: o
 *     aplicativo mostra "123 456" e quem copia leva o espaço junto);
 *   · números tabulares, para os dígitos não dançarem enquanto se digita —
 *     na sans (`a4p-valor-texto`), igual dentro e fora do app: só
 *     `tabular-nums` puxaria a display em `.ds-visor`;
 *   · ⚠️ **durante o envio o campo fica SÓ LEITURA, nunca `disabled`**: o
 *     navegador tira o foco de campo desabilitado, e depois de um código errado
 *     o teclado do telefone fechava bem quando a pessoa precisa digitar outro;
 *   · Enter sempre confirma — com o código incompleto, a tela diz o que falta
 *     (antes, Enter com 5 dígitos não fazia nada, sem retorno nenhum).
 */
export function CampoCodigo({
  valor,
  onMudar,
  onConfirmar,
  label = `Código de ${DIGITOS_CODIGO} dígitos`,
  invalido = false,
  autoFocus = false,
  disabled = false,
}: {
  valor: string;
  onMudar: (codigo: string) => void;
  /** Enter (a tela confere o tamanho e diz o que falta). */
  onConfirmar?: () => void;
  label?: string;
  invalido?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const id = React.useId();
  return (
    <Input
      id={id}
      label={label}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]*"
      maxLength={DIGITOS_CODIGO + 2}
      placeholder="000000"
      className="tabular-nums a4p-valor-texto"
      autoFocus={autoFocus}
      readOnly={disabled}
      aria-disabled={disabled || undefined}
      invalid={invalido}
      aria-invalid={invalido}
      value={valor}
      onChange={(e) => onMudar(normalizarCodigo(e.target.value))}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !disabled) onConfirmar?.();
      }}
    />
  );
}
