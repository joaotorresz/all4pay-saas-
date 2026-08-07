import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * all4pay DS — Input
 * Quiet bordered field on white, 10px radius. Optional leading/trailing
 * adornment (currency / search icon) and label.
 */
export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  label?: React.ReactNode;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  invalid?: boolean;
  containerClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input(
    { label, prefix, suffix, invalid = false, id, className, containerClassName, ...rest },
    ref,
  ) {
    const inputId =
      id ||
      (typeof label === "string"
        ? `in-${label.replace(/\s+/g, "-").toLowerCase()}`
        : undefined);

    return (
      <div className={cn("flex flex-col gap-[6px]", containerClassName)}>
        {label && (
          <label htmlFor={inputId} className="text-label font-medium text-muted">
            {label}
          </label>
        )}
        <div
          className={cn(
            "flex items-center gap-2 bg-surface-2 rounded-md px-3 h-10 border",
            invalid ? "border-warning" : "border-transparent",
          )}
        >
          {prefix && (
            <span className="text-faint text-[17px] inline-flex">{prefix}</span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "flex-1 min-w-0 border-none outline-none bg-transparent",
              "text-body font-regular text-ink placeholder:text-placeholder",
              className,
            )}
            {...rest}
          />
          {suffix && (
            <span className="text-faint text-[17px] inline-flex">{suffix}</span>
          )}
        </div>
      </div>
    );
  },
);
