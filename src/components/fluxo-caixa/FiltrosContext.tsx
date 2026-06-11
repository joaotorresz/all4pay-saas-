"use client";

import * as React from "react";

/**
 * Filtros globais do Fluxo de Caixa — qualquer alteração reprocessa a página
 * inteira (gráficos, KPIs, projeções, IA, cenários). Persistido em localStorage.
 */
export type PeriodoId = "hoje" | "7d" | "14d" | "30d" | "3m" | "6m" | "1a" | "custom";
export type Regime = "competencia" | "caixa" | "hibrido";
export type Visao = "previsto" | "realizado" | "consolidado";

export interface FluxoFiltros {
  periodo: PeriodoId;
  diasCustom: number; // usado quando periodo === "custom"
  conta: string; // "todas" ou account id
  regime: Regime;
  visao: Visao;
}

export const PERIODOS: { id: PeriodoId; label: string; dias: number }[] = [
  { id: "hoje", label: "Hoje", dias: 1 },
  { id: "7d", label: "7D", dias: 7 },
  { id: "14d", label: "14D", dias: 14 },
  { id: "30d", label: "30D", dias: 30 },
  { id: "3m", label: "3M", dias: 90 },
  { id: "6m", label: "6M", dias: 180 },
  { id: "1a", label: "1A", dias: 365 },
  { id: "custom", label: "Personalizado", dias: 60 },
];

export function diasDe(f: FluxoFiltros): number {
  if (f.periodo === "custom") return Math.max(1, f.diasCustom);
  return PERIODOS.find((p) => p.id === f.periodo)?.dias ?? 30;
}

const PADRAO: FluxoFiltros = {
  periodo: "30d", diasCustom: 60, conta: "todas",
  regime: "hibrido", visao: "consolidado",
};
const KEY = "a4p_fluxo_filtros";

interface Ctx { filtros: FluxoFiltros; set: (patch: Partial<FluxoFiltros>) => void }
const FiltrosCtx = React.createContext<Ctx | null>(null);

export function FluxoFiltrosProvider({ children }: { children: React.ReactNode }) {
  const [filtros, setFiltros] = React.useState<FluxoFiltros>(PADRAO);

  React.useEffect(() => {
    try {
      const s = localStorage.getItem(KEY);
      if (s) setFiltros({ ...PADRAO, ...JSON.parse(s) });
    } catch { /* ignore */ }
  }, []);

  const set = React.useCallback((patch: Partial<FluxoFiltros>) => {
    setFiltros((f) => {
      const next = { ...f, ...patch };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  return <FiltrosCtx.Provider value={{ filtros, set }}>{children}</FiltrosCtx.Provider>;
}

export function useFluxoFiltros(): Ctx {
  const c = React.useContext(FiltrosCtx);
  if (!c) throw new Error("useFluxoFiltros fora do provider");
  return c;
}
