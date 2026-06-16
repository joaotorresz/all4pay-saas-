"use client";

import * as React from "react";
import { isoDay } from "@/lib/aggregations";

/**
 * Contexto temporal GLOBAL da Home — agora navegável por MÊS (mesma lógica do
 * calendário de transações, estendida para toda a Home). Um único mês
 * selecionado que todos os widgets/cards consomem (from = 1º dia, to = último
 * dia). Persistido no localStorage. O seletor de mês fica no header.
 */
const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export interface PeriodValue {
  ano: number;
  mes: number; // 0-based
  from: string; // ISO — primeiro dia do mês
  to: string; // ISO — último dia do mês
  days: number; // dias no mês
  label: string; // "Junho 2026"
}

interface PeriodCtx extends PeriodValue {
  setMonth: (ano: number, mes: number) => void;
  shift: (delta: number) => void;
}

const KEY = "a4p_home_month";
const Ctx = React.createContext<PeriodCtx | null>(null);
const pad = (n: number) => String(n).padStart(2, "0");

function derive(ano: number, mes: number): PeriodValue {
  const last = new Date(ano, mes + 1, 0);
  return {
    ano, mes,
    from: `${ano}-${pad(mes + 1)}-01`,
    to: isoDay(last),
    days: last.getDate(),
    label: `${MESES[mes]} ${ano}`,
  };
}

export function PeriodProvider({ children }: { children: React.ReactNode }) {
  const now = new Date();
  const [ym, setYm] = React.useState<{ ano: number; mes: number }>({ ano: now.getFullYear(), mes: now.getMonth() });

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const [a, m] = raw.split("-").map(Number);
        if (!Number.isNaN(a) && !Number.isNaN(m)) setYm({ ano: a, mes: m });
      }
    } catch { /* ignore */ }
  }, []);

  const setMonth = React.useCallback((ano: number, mes: number) => {
    setYm({ ano, mes });
    try { localStorage.setItem(KEY, `${ano}-${mes}`); } catch { /* ignore */ }
  }, []);
  const shift = React.useCallback((delta: number) => {
    setYm((cur) => {
      const d = new Date(cur.ano, cur.mes + delta, 1);
      const next = { ano: d.getFullYear(), mes: d.getMonth() };
      try { localStorage.setItem(KEY, `${next.ano}-${next.mes}`); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const value = React.useMemo<PeriodCtx>(() => ({ ...derive(ym.ano, ym.mes), setMonth, shift }), [ym, setMonth, shift]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Consome o mês global. Fora do provider, devolve o mês atual (no-op nav). */
export function usePeriod(): PeriodCtx {
  const c = React.useContext(Ctx);
  if (c) return c;
  const now = new Date();
  return { ...derive(now.getFullYear(), now.getMonth()), setMonth: () => {}, shift: () => {} };
}
