"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";

/**
 * all4pay DS — DatePicker
 * Seletor de data com calendário no Design System (não usa o popup nativo do
 * navegador). Valor ISO yyyy-mm-dd; exibe dd/mm/aaaa. Monocromático: dia
 * selecionado em `ink`, hoje com anel `lime`, hover `surface-2`.
 */
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DIAS = ["D", "S", "T", "Q", "Q", "S", "S"];

function parseISO(v: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return isNaN(dt.getTime()) ? null : dt;
}
const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmt = (v: string) => { const [y, m, d] = v.split("-"); return d ? `${d}/${m}/${y}` : ""; };

export interface DatePickerProps {
  label?: React.ReactNode;
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  max?: string;
  invalid?: boolean;
  containerClassName?: string;
}

export function DatePicker({ label, value, onChange, min, max, invalid, containerClassName }: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const [view, setView] = React.useState(() => parseISO(value) ?? new Date());

  React.useEffect(() => { const d = parseISO(value); if (d) setView(d); }, [value]);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const y = view.getFullYear(), m = view.getMonth();
  const offset = new Date(y, m, 1).getDay();
  const diasNoMes = new Date(y, m + 1, 0).getDate();
  const hojeISO = toISO(new Date());
  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: diasNoMes }, (_, i) => i + 1)];

  const pick = (d: number) => {
    const iso = toISO(new Date(y, m, d));
    if ((min && iso < min) || (max && iso > max)) return;
    onChange(iso);
    setOpen(false);
  };

  return (
    <div ref={ref} className={cn("flex flex-col gap-[6px] relative", containerClassName)}>
      {label && <span className="text-label font-medium text-muted">{label}</span>}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "h-10 px-3 rounded-md bg-white border text-body inline-flex items-center gap-2 hover:border-faint outline-none",
          invalid ? "border-negative" : "border-border",
        )}
      >
        <Icon name="calendar" size={15} color="var(--color-text-secondary)" />
        <span className={value ? "text-ink tabular-nums" : "text-placeholder"}>{value ? fmt(value) : "dd/mm/aaaa"}</span>
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 w-[264px] rounded-md bg-white border border-border p-3" role="dialog">
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => setView(new Date(y, m - 1, 1))} className="p-1 rounded-sm hover:bg-surface-2" aria-label="Mês anterior">
              <Icon name="chevron-left" size={16} color="var(--color-text-secondary)" />
            </button>
            <span className="text-label font-medium text-ink">{MESES[m]} {y}</span>
            <button type="button" onClick={() => setView(new Date(y, m + 1, 1))} className="p-1 rounded-sm hover:bg-surface-2" aria-label="Próximo mês">
              <Icon name="chevron-right" size={16} color="var(--color-text-secondary)" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-[2px] mb-1">
            {DIAS.map((d, i) => <span key={i} className="text-[11px] text-faint text-center py-1">{d}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-[2px]">
            {cells.map((d, i) => {
              if (d == null) return <span key={i} />;
              const iso = toISO(new Date(y, m, d));
              const on = iso === value;
              const hoje = iso === hojeISO;
              const disabled = (min && iso < min) || (max && iso > max);
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!!disabled}
                  onClick={() => pick(d)}
                  className={cn(
                    "h-8 rounded-sm text-caption tabular-nums inline-flex items-center justify-center",
                    on ? "bg-ink text-white font-medium" : disabled ? "text-placeholder cursor-not-allowed" : "text-ink hover:bg-surface-2",
                    !on && hoje && "ring-1 ring-lime",
                  )}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
