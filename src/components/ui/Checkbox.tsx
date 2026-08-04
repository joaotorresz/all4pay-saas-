import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * all4pay DS — Checkbox
 * Small 8px-radius box; ink fill + white check when selected.
 * Used for table-row selection and option lists.
 */
export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  checked?: boolean;
  label?: React.ReactNode;
  /**
   * O nome do controle para quem NÃO enxerga a linha.
   *
   * ⚠️ Obrigatório quando não há `label` visível — que é o caso do checkbox de
   * seleção de linha de tabela. A auditoria mediu **51 campos sem nome numa
   * única tela** (Títulos a receber): cada linha da tabela tinha uma caixa que
   * o leitor de tela anuncia como "caixa de seleção, não marcada" e nada mais.
   * Com cinquenta delas em sequência, a tela é intransponível — não dá para
   * saber QUAL título se está marcando para dar baixa.
   */
  ariaLabel?: string;
}

export function Checkbox({
  checked = false,
  onChange,
  label,
  disabled = false,
  id,
  className,
  ariaLabel,
  ...rest
}: CheckboxProps) {
  const gerado = React.useId();
  // ⚠️ SEMPRE há id. Antes ele só existia quando o rótulo era string: um
  // checkbox sem rótulo textual ficava com `htmlFor` e `id` indefinidos, e o
  // `<label>` em volta não nomeava nada — que é como 51 campos ficaram anônimos.
  const boxId =
    id ||
    (typeof label === "string" ? `cb-${label.replace(/\s+/g, "-").toLowerCase()}` : `cb-${gerado}`);
  const nome = ariaLabel ?? (typeof label === "string" ? undefined : rest["aria-label"]);

  return (
    <label
      htmlFor={boxId}
      className={cn(
        "inline-flex items-center gap-2 text-[17px] text-ink",
        disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer",
        className,
      )}
    >
      <span
        className={cn(
          "inline-flex items-center justify-center w-[18px] h-[18px] shrink-0 rounded-sm border",
          "transition-[background-color,border-color] duration-100 ease-out",
          checked ? "bg-ink border-ink" : "bg-white border-border",
        )}
      >
        {checked && (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path
              d="M2.5 6.2L4.8 8.5L9.5 3.5"
              stroke="#fff"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <input
        id={boxId}
        aria-label={nome}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="absolute opacity-0 w-0 h-0"
        {...rest}
      />
      {label && <span>{label}</span>}
    </label>
  );
}
