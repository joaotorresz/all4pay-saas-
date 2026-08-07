import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * all4pay DS — Select
 * A native <select> styled to match the DS (quiet bordered field, 10px
 * radius, chevron affordance). Native = fully accessible + mobile-friendly.
 */
export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  label?: React.ReactNode;
  required?: boolean;
  invalid?: boolean;
  options: SelectOption[];
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  containerClassName?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  function Select(
    { label, required, invalid, options, placeholder, value, onChange, id, className, containerClassName, ...rest },
    ref,
  ) {
    const gerado = React.useId();
    /**
     * ⚠️ SEMPRE há id — e o `<label>` sempre aponta para ele.
     *
     * Antes, o id só nascia quando o rótulo era uma STRING. Um `Select` com
     * rótulo em JSX (com um "i" ao lado, por exemplo) ficava com `htmlFor` e
     * `id` indefinidos, e o rótulo deixava de nomear o campo. A auditoria mediu
     * **7 selects sem nome só na tela do DRE** — os filtros de período, regime e
     * conta. Quem usa leitor de tela ouvia "lista, Agosto 2026" e não tinha como
     * saber que aquilo era o filtro de período.
     */
    const selectId =
      id ||
      (typeof label === "string"
        ? `sel-${label.replace(/\s+/g, "-").toLowerCase()}`
        : `sel-${gerado}`);
    return (
      <div className={cn("flex flex-col gap-[6px]", containerClassName)}>
        {label && (
          <label htmlFor={selectId} className="text-label font-medium text-muted">
            {label}
            {required && <span className="text-negative"> *</span>}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            aria-label={typeof label === "string" ? undefined : (rest["aria-label"] ?? placeholder)}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={cn(
              "w-full appearance-none h-10 pl-3 pr-9 rounded-md bg-surface-2 border text-body text-ink",
              "outline-none focus:border-faint",
              value === "" ? "text-placeholder" : "text-ink",
              invalid ? "border-negative" : "border-transparent",
              className,
            )}
            {...rest}
          >
            {placeholder !== undefined && (
              <option value="" disabled hidden>
                {placeholder}
              </option>
            )}
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <svg
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-text-tertiary)"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </div>
    );
  },
);
