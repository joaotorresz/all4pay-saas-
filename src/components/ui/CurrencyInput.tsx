import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * all4pay DS — CurrencyInput
 * BRL-masked amount field. Keeps a numeric `value` (reais) and formats as
 * the user types (pt-BR, "," decimals). Shows the faint R$ prefix.
 */
const fmt = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export interface CurrencyInputProps {
  label?: React.ReactNode;
  required?: boolean;
  invalid?: boolean;
  value: number;
  onValueChange: (value: number) => void;
  placeholder?: string;
  id?: string;
  containerClassName?: string;
}

export function CurrencyInput({
  label,
  required,
  invalid,
  value,
  onValueChange,
  placeholder = "0,00",
  id,
  containerClassName,
}: CurrencyInputProps) {
  const inputId =
    id ||
    (typeof label === "string"
      ? `cur-${label.replace(/\s+/g, "-").toLowerCase()}`
      : undefined);

  const display = value > 0 ? fmt.format(value) : "";

  const handle = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    onValueChange(digits ? Number(digits) / 100 : 0);
  };

  return (
    <div className={cn("flex flex-col gap-[6px]", containerClassName)}>
      {label && (
        <label htmlFor={inputId} className="text-label font-medium text-muted">
          {label}
          {required && <span className="text-negative"> *</span>}
        </label>
      )}
      <div
        className={cn(
          "flex items-center gap-2 bg-surface-2 rounded-md px-3 h-10 border",
          invalid ? "border-negative" : "border-transparent",
        )}
      >
        <span className="text-faint text-[17px]">R$</span>
        <input
          id={inputId}
          inputMode="numeric"
          value={display}
          placeholder={placeholder}
          onChange={(e) => handle(e.target.value)}
          className="flex-1 min-w-0 border-none outline-none bg-transparent text-body text-ink tabular-nums placeholder:text-placeholder"
        />
      </div>
    </div>
  );
}
