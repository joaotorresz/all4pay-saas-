"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
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
 *
 * **Seis casas, um campo só** (dono, 04/11/2026: a tela do código estava
 * feia). O que se vê são seis casas, uma por dígito, e a casa da vez ganha o
 * foco do DS. Por baixo continua UM `<input>` transparente cobrindo as casas:
 * colar "123 456", a sugestão do sistema e o apagar funcionam como sempre —
 * seis inputs separados quebrariam os três.
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
  /** Vazio esconde o rótulo (a tela já diz o que é); ele segue no leitor de tela. */
  label?: string;
  invalido?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const id = React.useId();
  const [foco, setFoco] = React.useState(false);
  const digitos = normalizarCodigo(valor);
  const vez = Math.min(digitos.length, DIGITOS_CODIGO - 1);
  const rotulo = label || `Código de ${DIGITOS_CODIGO} dígitos`;
  return (
    <div className="flex flex-col gap-[6px] min-w-0">
      {label && (
        <label htmlFor={id} className="text-label font-medium text-muted">
          {label}
        </label>
      )}
      <div className="relative">
        <div aria-hidden className="grid gap-2" style={{ gridTemplateColumns: `repeat(${DIGITOS_CODIGO}, minmax(0, 1fr))` }}>
          {Array.from({ length: DIGITOS_CODIGO }, (_, i) => {
            const d = digitos[i];
            const daVez = foco && !disabled && i === vez;
            return (
              <span
                key={i}
                data-vez={daVez || undefined}
                className={cn(
                  "a4p-campo a4p-casa-codigo h-14 rounded-md flex items-center justify-center",
                  "font-medium text-ink tabular-nums a4p-valor-texto",
                  invalido && "border-warning",
                )}
              >
                {d ? <span className="text-h2 leading-none">{d}</span> : (daVez ? <span className="a4p-casa-cursor" /> : <span className="text-placeholder">·</span>)}
              </span>
            );
          })}
        </div>
        <input
          id={id}
          aria-label={label ? undefined : rotulo}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={DIGITOS_CODIGO + 2}
          autoFocus={autoFocus}
          readOnly={disabled}
          aria-disabled={disabled || undefined}
          aria-invalid={invalido}
          value={digitos}
          onFocus={() => setFoco(true)}
          onBlur={() => setFoco(false)}
          onChange={(e) => onMudar(normalizarCodigo(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !disabled) onConfirmar?.();
          }}
          className="absolute inset-0 w-full h-full opacity-0 cursor-text"
          style={{ caretColor: "transparent" }}
        />
      </div>
    </div>
  );
}
