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
    const inputId =
      id ||
      (typeof label === "string"
        ? `dt-${label.replace(/\s+/g, "-").toLowerCase()}`
        : undefined);
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
            "h-10 px-3 rounded-md bg-white border text-body text-ink outline-none focus:border-faint",
            invalid ? "border-negative" : "border-border",
            className,
          )}
          {...rest}
        />
      </div>
    );
  },
);
