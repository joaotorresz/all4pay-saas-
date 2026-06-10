"use client";

import * as React from "react";
import { Icon, DateField } from "@/components/ui";
import { cn } from "@/lib/utils";
import { usePeriod, type PeriodPreset } from "./PeriodContext";

/**
 * Pílula de período global da Home. Segmentos rápidos + um menu (▼) para
 * Trimestre/Ano/Personalizado. Controla o PeriodContext — todos os widgets
 * que consomem usePeriod() acompanham.
 */
const QUICK: { id: Exclude<PeriodPreset, "custom" | "trimestre" | "ano">; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "7d", label: "7D" },
  { id: "14d", label: "14D" },
  { id: "30d", label: "30D" },
  { id: "mes", label: "Mês" },
];

export function PeriodPill() {
  const p = usePeriod();
  const [menu, setMenu] = React.useState(false);
  const [custom, setCustomOpen] = React.useState(false);
  const [from, setFrom] = React.useState(p.from);
  const [to, setTo] = React.useState(p.to);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setMenu(false); setCustomOpen(false); } };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const extraAtivo = p.preset === "trimestre" || p.preset === "ano" || p.preset === "custom";

  return (
    <div ref={ref} className="relative inline-flex items-center gap-1 bg-surface-2 rounded-md p-[2px]" role="group" aria-label="Período">
      {QUICK.map((q) => (
        <button
          key={q.id}
          onClick={() => p.setPreset(q.id)}
          aria-pressed={p.preset === q.id}
          className={cn(
            "text-caption font-medium rounded-sm px-[10px] py-[4px] transition-colors whitespace-nowrap",
            p.preset === q.id ? "bg-white text-ink shadow-pill" : "text-muted hover:text-ink",
          )}
        >
          {q.label}
        </button>
      ))}
      <button
        onClick={() => setMenu((m) => !m)}
        aria-label="Mais períodos"
        aria-expanded={menu}
        className={cn(
          "flex items-center gap-1 text-caption font-medium rounded-sm px-[8px] py-[4px] transition-colors",
          extraAtivo ? "bg-white text-ink shadow-pill" : "text-muted hover:text-ink",
        )}
      >
        {extraAtivo ? p.label : ""}
        <Icon name="chevron-down" size={13} />
      </button>

      {menu && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-[70] w-[220px] bg-white rounded-card border border-border shadow-popover p-1">
          {!custom ? (
            <>
              <MenuItem label="Trimestre (QTD)" active={p.preset === "trimestre"} onClick={() => { p.setPreset("trimestre"); setMenu(false); }} />
              <MenuItem label="Ano (YTD)" active={p.preset === "ano"} onClick={() => { p.setPreset("ano"); setMenu(false); }} />
              <MenuItem label="Personalizado…" active={p.preset === "custom"} onClick={() => { setFrom(p.from); setTo(p.to); setCustomOpen(true); }} />
            </>
          ) : (
            <div className="flex flex-col gap-2 p-2">
              <span className="text-caption font-medium text-muted">Período personalizado</span>
              <DateField label="De" value={from} onChange={setFrom} />
              <DateField label="Até" value={to} onChange={setTo} />
              <div className="flex justify-end gap-2 pt-1">
                <button className="text-caption text-muted hover:text-ink px-2 py-1" onClick={() => setCustomOpen(false)}>Voltar</button>
                <button
                  className="text-caption font-medium text-ink bg-lime rounded-sm px-3 py-1 disabled:opacity-50"
                  disabled={!from || !to}
                  onClick={() => { p.setCustom(from, to); setMenu(false); setCustomOpen(false); }}
                >
                  Aplicar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between gap-2 text-[14px] rounded-sm px-3 py-2 text-left hover:bg-surface-2",
        active ? "text-ink font-medium" : "text-muted",
      )}
    >
      {label}
      {active && <Icon name="check" size={14} color="var(--color-ink)" />}
    </button>
  );
}
