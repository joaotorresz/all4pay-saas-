"use client";

import * as React from "react";
import { isoDay } from "@/lib/aggregations";

/**
 * Contexto temporal GLOBAL da Home. Dois modos, um único período ativo que todos
 * os widgets consomem (from/to/label):
 *  • MÊS (padrão) — navegado pelo seletor ‹ Junho 2026 › no header;
 *  • RANGE (personalizado) — janela de 45/60/90 dias entre um mês de começo e um
 *    de fim, escolhida no seletor "Período". Persistido no localStorage.
 */
const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const MES_ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export interface PeriodValue {
  modo: "mes" | "range";
  ano: number;
  mes: number; // 0-based (mês de referência / começo)
  from: string; // ISO — início (inclusive)
  to: string; // ISO — fim (inclusive)
  days: number;
  label: string;
}

interface PeriodCtx extends PeriodValue {
  setMonth: (ano: number, mes: number) => void;
  shift: (delta: number) => void;
  setRange: (from: string, to: string) => void;
}

const KEY = "a4p_home_period";
const Ctx = React.createContext<PeriodCtx | null>(null);
const pad = (n: number) => String(n).padStart(2, "0");

function monthValue(ano: number, mes: number): PeriodValue {
  const last = new Date(ano, mes + 1, 0);
  return { modo: "mes", ano, mes, from: `${ano}-${pad(mes + 1)}-01`, to: isoDay(last), days: last.getDate(), label: `${MESES[mes]} ${ano}` };
}
function rangeValue(from: string, to: string): PeriodValue {
  const a = new Date(from + "T00:00:00"); const b = new Date(to + "T00:00:00");
  const days = Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1);
  // Rótulo por DIA (ex.: "07/jun – 14/jun"); inclui o ano só se o range cruzar anos.
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const dia = (d: Date, comAno: boolean) => `${pad2(d.getDate())}/${MES_ABBR[d.getMonth()]}${comAno ? `/${String(d.getFullYear()).slice(2)}` : ""}`;
  const cruzaAno = a.getFullYear() !== b.getFullYear();
  const label = `${dia(a, cruzaAno)} – ${dia(b, cruzaAno)}`;
  return { modo: "range", ano: a.getFullYear(), mes: a.getMonth(), from, to, days, label };
}

interface Sel { ym: { ano: number; mes: number }; range: { from: string; to: string } | null }

export function PeriodProvider({ children }: { children: React.ReactNode }) {
  const now = new Date();
  const [sel, setSel] = React.useState<Sel>({ ym: { ano: now.getFullYear(), mes: now.getMonth() }, range: null });

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const j = JSON.parse(raw) as Sel;
        if (j?.ym) setSel({ ym: j.ym, range: j.range ?? null });
      }
    } catch { /* ignore */ }
  }, []);

  const persist = (s: Sel) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } };
  const setMonth = React.useCallback((ano: number, mes: number) => setSel((s) => { const n = { ym: { ano, mes }, range: null }; persist(n); return n; }), []);
  const shift = React.useCallback((delta: number) => setSel((s) => {
    const d = new Date(s.ym.ano, s.ym.mes + delta, 1);
    const n: Sel = { ym: { ano: d.getFullYear(), mes: d.getMonth() }, range: null };
    persist(n); return n;
  }), []);
  const setRange = React.useCallback((from: string, to: string) => setSel((s) => { const n: Sel = { ...s, range: { from, to } }; persist(n); return n; }), []);

  const value = React.useMemo<PeriodCtx>(() => {
    const base = sel.range ? rangeValue(sel.range.from, sel.range.to) : monthValue(sel.ym.ano, sel.ym.mes);
    return { ...base, setMonth, shift, setRange };
  }, [sel, setMonth, shift, setRange]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Consome o período global. Fora do provider, devolve o mês atual (no-op). */
export function usePeriod(): PeriodCtx {
  const c = React.useContext(Ctx);
  if (c) return c;
  const now = new Date();
  return { ...monthValue(now.getFullYear(), now.getMonth()), setMonth: () => {}, shift: () => {}, setRange: () => {} };
}

export { MESES, MES_ABBR };
