"use client";

import { Icon } from "@/components/ui";
import { usePeriod } from "./PeriodContext";

/** Seletor de mês do header da Home — ‹ Junho 2026 ›. Controla o mês global que
 *  todos os widgets consomem. Substitui a pílula de período e o "Personalizar". */
export function MonthSelector() {
  const p = usePeriod();
  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-1 py-[3px]">
      <button onClick={() => p.shift(-1)} aria-label="Mês anterior" className="p-1 rounded-sm hover:bg-surface-2">
        <Icon name="chevron-left" size={16} color="var(--color-text-secondary)" />
      </button>
      <span className="text-label font-medium text-ink min-w-[128px] text-center tabular-nums">{p.label}</span>
      <button onClick={() => p.shift(1)} aria-label="Próximo mês" className="p-1 rounded-sm hover:bg-surface-2">
        <Icon name="chevron-right" size={16} color="var(--color-text-secondary)" />
      </button>
    </div>
  );
}
