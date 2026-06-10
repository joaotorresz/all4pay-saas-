"use client";

import * as React from "react";
import { isoDay } from "@/lib/aggregations";

/**
 * Contexto temporal GLOBAL da Home — a "pílula de período".
 * Um único período selecionado (Hoje · 7D · 14D · 30D · Mês · Trimestre · Ano ·
 * Personalizado) que todos os widgets/cards da Home consomem, para consistência.
 * Mês/Trimestre/Ano são MTD/QTD/YTD (alinha com o DRE). Persistido no localStorage.
 */
export type PeriodPreset = "hoje" | "7d" | "14d" | "30d" | "custom";

export interface PeriodValue {
  preset: PeriodPreset;
  from: string; // ISO (início, inclusive)
  to: string; // ISO (hoje, inclusive)
  days: number; // span em dias — para os gráficos diários
  months: number; // span aproximado em meses — para os gráficos mensais
  label: string;
}

interface PeriodCtx extends PeriodValue {
  setPreset: (p: Exclude<PeriodPreset, "custom">) => void;
  setCustom: (from: string, to: string) => void;
}

const KEY = "a4p_home_period";
const Ctx = React.createContext<PeriodCtx | null>(null);

const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const diffDays = (from: string, to: string) =>
  Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1);

const LABELS: Record<PeriodPreset, string> = {
  hoje: "Hoje", "7d": "7 dias", "14d": "14 dias", "30d": "30 dias", custom: "Personalizado",
};

/** Deriva from/to/days/months a partir do preset (relativo a hoje). */
function derive(preset: PeriodPreset, custom?: { from: string; to: string }): PeriodValue {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const to = isoDay(today);
  let from = to;
  if (preset === "custom" && custom) {
    from = custom.from <= custom.to ? custom.from : custom.to;
    const t = custom.to >= custom.from ? custom.to : custom.from;
    const days = diffDays(from, t);
    return { preset, from, to: t, days, months: Math.max(1, Math.round(days / 30)), label: rangeLabel(from, t) };
  }
  switch (preset) {
    case "hoje": from = to; break;
    case "7d": from = isoDay(addDays(today, -6)); break;
    case "14d": from = isoDay(addDays(today, -13)); break;
    case "30d": from = isoDay(addDays(today, -29)); break;
    default: from = isoDay(addDays(today, -13));
  }
  const days = diffDays(from, to);
  return { preset, from, to, days, months: Math.max(1, Math.ceil(days / 30)), label: LABELS[preset] };
}

function rangeLabel(from: string, to: string) {
  const f = from.slice(8, 10) + "/" + from.slice(5, 7);
  const t = to.slice(8, 10) + "/" + to.slice(5, 7);
  return `${f}–${t}`;
}

export function PeriodProvider({ children }: { children: React.ReactNode }) {
  const [preset, setPresetState] = React.useState<PeriodPreset>("14d");
  const [custom, setCustomState] = React.useState<{ from: string; to: string } | undefined>();

  // Restaura preferência (uma vez, no cliente).
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const j = JSON.parse(raw) as { preset: PeriodPreset; custom?: { from: string; to: string } };
        const ok: PeriodPreset[] = ["hoje", "7d", "14d", "30d", "custom"];
        if (j.preset && ok.includes(j.preset)) setPresetState(j.preset);
        if (j.custom) setCustomState(j.custom);
      }
    } catch { /* ignore */ }
  }, []);

  const persist = (p: PeriodPreset, c?: { from: string; to: string }) => {
    try { localStorage.setItem(KEY, JSON.stringify({ preset: p, custom: c })); } catch { /* ignore */ }
  };
  const setPreset = (p: Exclude<PeriodPreset, "custom">) => { setPresetState(p); persist(p); };
  const setCustom = (from: string, to: string) => { setPresetState("custom"); setCustomState({ from, to }); persist("custom", { from, to }); };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = React.useMemo<PeriodCtx>(() => ({ ...derive(preset, custom), setPreset, setCustom }), [preset, custom]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Consome o período global. Fora do provider, devolve um default (14 dias). */
export function usePeriod(): PeriodCtx {
  const c = React.useContext(Ctx);
  if (c) return c;
  return { ...derive("14d"), setPreset: () => {}, setCustom: () => {} };
}
