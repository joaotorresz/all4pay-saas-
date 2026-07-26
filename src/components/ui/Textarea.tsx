import * as React from "react";
import { cn } from "@/lib/utils";

/** all4pay DS — Textarea. Quiet bordered multi-line field, 10px radius. */
export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: React.ReactNode;
  required?: boolean;
  invalid?: boolean;
  containerClassName?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    { label, required, invalid, id, rows = 3, className, containerClassName, ...rest },
    ref,
  ) {
    const taId =
      id ||
      (typeof label === "string"
        ? `ta-${label.replace(/\s+/g, "-").toLowerCase()}`
        : undefined);
    return (
      <div className={cn("flex flex-col gap-[6px]", containerClassName)}>
        {label && (
          <label htmlFor={taId} className="text-label font-medium text-muted">
            {label}
            {required && <span className="text-negative"> *</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={taId}
          rows={rows}
          className={cn(
            "rounded-md bg-surface-2 border px-3 py-2 text-body text-ink outline-none focus:border-faint resize-y",
            "placeholder:text-placeholder",
            invalid ? "border-negative" : "border-transparent",
            className,
          )}
          {...rest}
        />
      </div>
    );
  },
);
