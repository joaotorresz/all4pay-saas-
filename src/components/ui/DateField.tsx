import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * all4pay DS — DateField
 * Native date input (value is ISO yyyy-mm-dd; the browser renders it in the
 * user's locale, pt-BR). Styled to match the DS field.
 */
export interface DateFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  label?: React.ReactNode;
  required?: boolean;
  invalid?: boolean;
  value: string;
  onChange: (value: string) => void;
  containerClassName?: string;
}

export const DateField = React.forwardRef<HTMLInputElement, DateFieldProps>(
  function DateField(
    { label, required, invalid, value, onChange, id, className, containerClassName, ...rest },
    ref,
  ) {
    const gerado = React.useId();
    /**
     * ⚠️ SEMPRE há id — mesma correção do `Select` e do `Checkbox`. Sem rótulo
     * string, o campo ficava sem `id`, o `<label>` não apontava para lugar
     * nenhum e o leitor de tela anunciava só "data". A auditoria mediu isso nos
     * filtros de período do DRE e do extrato: dois campos anônimos que decidem
     * o que o relatório inteiro mostra.
     */
    const inputId =
      id ||
      (typeof label === "string"
        ? `dt-${label.replace(/\s+/g, "-").toLowerCase()}`
        : `dt-${gerado}`);
    return (
      <div className={cn("flex flex-col gap-[6px]", containerClassName)}>
        {label && (
          <label htmlFor={inputId} className="text-label font-medium text-muted">
            {label}
            {required && <span className="text-negative"> *</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "h-10 px-3 rounded-md bg-surface-2 border text-body text-ink outline-none focus:border-faint",
            invalid ? "border-negative" : "border-transparent",
            className,
          )}
          {...rest}
        />
      </div>
    );
  },
);
