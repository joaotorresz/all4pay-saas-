"use client";

import * as React from "react";
import { DateField } from "@/components/ui";
import { cn } from "@/lib/utils";
import { usePeriod, type PeriodPreset } from "./PeriodContext";

/**
 * Pílula de período global da Home — tudo em pills:
 * Hoje · 7 dias · 14 dias · 30 dias · Personalizável (abre seletor de datas).
 * Controla o PeriodContext — todos os widgets que consomem usePeriod() acompanham.
 */
const QUICK: { id: Exclude<PeriodPreset, "custom" | "mes" | "trimestre" | "ano">; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "7d", label: "7 dias" },
  { id: "14d", label: "14 dias" },
  { id: "30d", label: "30 dias" },
];

export function PeriodPill() {
  const p = usePeriod();
  const [open, setOpen] = React.useState(false);
  const [from, setFrom] = React.useState(p.from);
  const [to, setTo] = React.useState(p.to);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pillCls = (active: boolean) =>
    cn(
      "text-caption font-medium rounded-sm px-[10px] py-[4px] transition-colors whitespace-nowrap",
      active ? "bg-white text-ink shadow-pill" : "text-muted hover:text-ink",
    );

  return (
    <div ref={ref} className="relative inline-flex items-center gap-1 bg-surface-2 rounded-md p-[2px]" role="group" aria-label="Período">
      {QUICK.map((q) => (
        <button key={q.id} onClick={() => p.setPreset(q.id)} aria-pressed={p.preset === q.id} className={pillCls(p.preset === q.id)}>
          {q.label}
        </button>
      ))}
      <button
        onClick={() => { setFrom(p.from); setTo(p.to); setOpen((o) => !o); }}
        aria-pressed={p.preset === "custom"}
        aria-expanded={open}
        className={pillCls(p.preset === "custom")}
      >
        {p.preset === "custom" ? p.label : "Personalizável"}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-[70] w-[230px] bg-white rounded-card border border-border shadow-popover p-3 flex flex-col gap-2">
          <span className="text-caption font-medium text-muted">Período personalizado</span>
          <DateField label="De" value={from} onChange={setFrom} />
          <DateField label="Até" value={to} onChange={setTo} />
          <div className="flex justify-end gap-2 pt-1">
            <button className="text-caption text-muted hover:text-ink px-2 py-1" onClick={() => setOpen(false)}>Cancelar</button>
            <button
              className="text-caption font-medium text-on-lime bg-lime rounded-sm px-3 py-1 disabled:opacity-50"
              disabled={!from || !to}
              onClick={() => { p.setCustom(from, to); setOpen(false); }}
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
