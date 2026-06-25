"use client";

/**
 * Filtro de período da Home (header) — três "box": Essa semana · Mês atual ·
 * Personalizado. Personalizado abre um painel abaixo com durações rápidas
 * (1 / 2 / 3 / 6 / 12 meses) e, abaixo, os seletores de mês de início e fim.
 * Tudo aplica no PeriodContext global (from/to), que os widgets consomem.
 */
import * as React from "react";
import { Icon, Select } from "@/components/ui";
import { isoDay } from "@/lib/aggregations";
import { usePeriod, MES_ABBR } from "./PeriodContext";

const pad = (n: number) => String(n).padStart(2, "0");
const firstDay = (y: number, m: number) => `${y}-${pad(m + 1)}-01`;
const lastDay = (y: number, m: number) => { const d = new Date(y, m + 1, 0); return `${y}-${pad(m + 1)}-${pad(d.getDate())}`; };

type YM = { y: number; m: number };
const encode = (v: YM) => `${v.y}.${v.m}`;
const decode = (s: string): YM => { const [y, m] = s.split("."); return { y: Number(y), m: Number(m) }; };
const before = (a: YM, b: YM) => a.y < b.y || (a.y === b.y && a.m <= b.m);

function weekRange() {
  const h = new Date(); h.setHours(0, 0, 0, 0);
  const dom = new Date(h); dom.setDate(h.getDate() - h.getDay());
  const sab = new Date(dom); sab.setDate(dom.getDate() + 6);
  return { from: isoDay(dom), to: isoDay(sab) };
}

export function PeriodFilter() {
  const period = usePeriod();
  const now = new Date();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  const wk = weekRange();
  const isWeek = period.modo === "range" && period.from === wk.from && period.to === wk.to;
  const isMonth = period.modo === "mes" && period.ano === now.getFullYear() && period.mes === now.getMonth();
  const isCustom = !isWeek && !isMonth;

  // estado dos seletores do personalizado
  const [start, setStart] = React.useState<YM>({ y: now.getFullYear(), m: now.getMonth() });
  const [end, setEnd] = React.useState<YM>({ y: now.getFullYear(), m: now.getMonth() });
  const [dur, setDur] = React.useState<number | null>(null);

  // fecha o painel ao clicar fora
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // opções de mês (24 meses para trás) — barato, sem memo
  const opts: { value: string; label: string }[] = [];
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    opts.push({ value: encode({ y: d.getFullYear(), m: d.getMonth() }), label: `${MES_ABBR[d.getMonth()]}/${String(d.getFullYear()).slice(2)}` });
  }

  const aplicar = (s: YM, e: YM) => {
    const ss = before(s, e) ? s : e;
    const ee = before(s, e) ? e : s;
    period.setRange(firstDay(ss.y, ss.m), lastDay(ee.y, ee.m));
  };

  const escolherDuracao = (n: number) => {
    setDur(n);
    const e: YM = { y: now.getFullYear(), m: now.getMonth() };
    const sd = new Date(now.getFullYear(), now.getMonth() - (n - 1), 1);
    const s: YM = { y: sd.getFullYear(), m: sd.getMonth() };
    setStart(s); setEnd(e); aplicar(s, e);
  };

  const btn = (ativo: boolean) =>
    `inline-flex items-center h-9 px-4 rounded-pill text-[15px] font-medium transition-colors ${ativo ? "bg-ink text-white" : "bg-white border border-border text-muted hover:text-ink"}`;

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-2">
        <button className={btn(isWeek)} onClick={() => { period.setRange(wk.from, wk.to); setOpen(false); }}>Essa semana</button>
        <button className={btn(isMonth)} onClick={() => { period.setMonth(now.getFullYear(), now.getMonth()); setOpen(false); }}>Mês atual</button>
        <button
          className={btn(isCustom || open)}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <Icon name="chevron-down" size={15} color={isCustom || open ? "#fff" : "var(--color-text-secondary)"} className="-ml-1 mr-1" />
          {isCustom ? period.label : "Personalizado"}
        </button>
      </div>

      {open && (
        <div className="absolute right-0 mt-2 z-50 w-[320px] bg-white rounded-card border border-border p-4 flex flex-col gap-3" style={{ boxShadow: "0 12px 32px rgba(14,19,30,0.16)" }}>
          <span className="text-caption font-medium text-muted">Duração</span>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 6, 12].map((n) => (
              <button
                key={n}
                onClick={() => escolherDuracao(n)}
                className={`text-caption font-medium rounded-pill px-3 py-[6px] border transition-colors ${dur === n ? "bg-ink text-white border-ink" : "bg-white text-muted border-border hover:text-ink"}`}
              >
                {n} {n === 1 ? "mês" : "meses"}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="flex flex-col gap-1">
              <span className="text-caption text-faint">Mês de início</span>
              <Select value={encode(start)} onChange={(v) => { const s = decode(v); setStart(s); setDur(null); aplicar(s, end); }} options={opts} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-caption text-faint">Mês final</span>
              <Select value={encode(end)} onChange={(v) => { const e = decode(v); setEnd(e); setDur(null); aplicar(start, e); }} options={opts} />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-caption text-faint">{period.label}</span>
            <button onClick={() => setOpen(false)} className="text-caption font-medium text-ink hover:underline">Pronto</button>
          </div>
        </div>
      )}
    </div>
  );
}
