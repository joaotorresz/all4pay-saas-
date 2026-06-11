"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * all4pay DS — DropdownMenu
 * A quiet anchored menu: white panel, faint border, popover shadow, grouped
 * items with section labels + dividers and an optional right-aligned shortcut
 * hint. Closes on outside-click / Esc. The trigger is a render-prop so any DS
 * Button/Pill can open it.
 */
export interface DropdownItem {
  id: string;
  label: string;
  /** Single letter shown as the Alt+ shortcut hint (handling is the caller's). */
  shortcut?: string;
}
export interface DropdownGroup {
  label?: string;
  items: DropdownItem[];
}

export interface DropdownMenuProps {
  trigger: (api: { open: boolean; toggle: () => void }) => React.ReactNode;
  groups: DropdownGroup[];
  onSelect: (id: string) => void;
  align?: "left" | "right";
  menuLabel?: string;
  width?: number;
}

export function DropdownMenu({
  trigger,
  groups,
  onSelect,
  align = "right",
  menuLabel,
  width = 264,
}: DropdownMenuProps) {
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const toggle = React.useCallback(() => setOpen((o) => !o), []);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (id: string) => {
    setOpen(false);
    onSelect(id);
  };

  return (
    <div ref={wrapRef} className="relative inline-flex">
      {trigger({ open, toggle })}
      {open && (
        <div
          role="menu"
          aria-label={menuLabel}
          style={{ width }}
          className={cn(
            "absolute top-full mt-2 z-50 bg-white border border-border rounded-card shadow-popover py-2",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {groups.map((g, gi) => (
            <div key={gi}>
              {gi > 0 && <div className="my-2 border-t border-border-soft" />}
              {g.label && (
                <div className="px-3 pt-1 pb-[6px] text-caption font-medium tracking-[0.04em] text-faint">
                  {g.label}
                </div>
              )}
              {g.items.map((it) => (
                <button
                  key={it.id}
                  role="menuitem"
                  onClick={() => choose(it.id)}
                  className="flex items-center justify-between w-full gap-4 px-3 py-2 text-left text-[17px] text-ink rounded-md hover:bg-surface-2 transition-colors"
                >
                  <span>{it.label}</span>
                  {it.shortcut && (
                    <span className="text-[13px] font-medium text-faint bg-black/5 rounded-[5px] px-[5px] py-[1px]">
                      Alt+{it.shortcut}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
