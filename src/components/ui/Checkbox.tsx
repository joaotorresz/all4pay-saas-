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
}

export function Checkbox({
  checked = false,
  onChange,
  label,
  disabled = false,
  id,
  className,
  ...rest
}: CheckboxProps) {
  const boxId =
    id ||
    (typeof label === "string"
      ? `cb-${label.replace(/\s+/g, "-").toLowerCase()}`
      : undefined);

  return (
    <label
      htmlFor={boxId}
      className={cn(
        "inline-flex items-center gap-2 text-[14px] text-ink",
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
