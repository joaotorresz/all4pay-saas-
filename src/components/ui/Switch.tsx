import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * all4pay DS — Switch
 * Quiet toggle: ink track when on, white knob. For "Habilitar rateio",
 * "Repetir lançamento?", etc.
 */
export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  id?: string;
  disabled?: boolean;
  className?: string;
}

export function Switch({
  checked,
  onChange,
  label,
  id,
  disabled,
  className,
}: SwitchProps) {
  const switchId =
    id ||
    (typeof label === "string"
      ? `sw-${label.replace(/\s+/g, "-").toLowerCase()}`
      : undefined);
  return (
    <label
      htmlFor={switchId}
      className={cn(
        "inline-flex items-center gap-[10px] text-[14px] text-ink select-none",
        disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer",
        className,
      )}
    >
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative w-9 h-[20px] rounded-pill shrink-0 transition-colors",
          checked ? "bg-ink" : "bg-surface-3 border border-border",
        )}
      >
        <span
          className={cn(
            "absolute top-1/2 -translate-y-1/2 w-[14px] h-[14px] rounded-pill bg-white shadow-pill transition-[left]",
            checked ? "left-[18px]" : "left-[3px]",
          )}
        />
      </button>
      {label && <span>{label}</span>}
    </label>
  );
}
