"use client";

/**
 * Filtro de período da Home (header) — três "box": Essa semana · Mês atual ·
 * Personalizado. No Personalizado, escolhe-se a DURAÇÃO (1/2/3/6/12 meses) e UM
 * único mês de referência: para 1 mês é o "Mês de consulta"; para N meses é o
 * mês final (a janela são os N meses terminando nele). O seletor de mês é um
 * dropdown no DS do sistema (não o <select> nativo). Aplica no PeriodContext.
 */
import * as React from "react";
import { Icon } from "@/components/ui";
import { isoDay } from "@/lib/aggregations";
import { usePeriod, MES_ABBR } from "./PeriodContext";

const pad = (n: number) => String(n).padStart(2, "0");
const firstDay = (y: number, m: number) => `${y}-${pad(m + 1)}-01`;
const lastDay = (y: number, m: number) => { const d = new Date(y, m + 1, 0); return `${y}-${pad(m + 1)}-${pad(d.getDate())}`; };

type YM = { y: number; m: number };
const encode = (v: YM) => `${v.y}.${v.m}`;
const mesLabel = (v: YM) => `${MES_ABBR[v.m]}/${String(v.y).slice(2)}`;

function weekRange() {
  const h = new Date(); h.setHours(0, 0, 0, 0);
  const dom = new Date(h); dom.setDate(h.getDate() - h.getDay());
  const sab = new Date(dom); sab.setDate(dom.getDate() + 6);
  return { from: isoDay(dom), to: isoDay(sab) };
}

const DURACOES = [1, 2, 3, 6, 12];

export function PeriodFilter() {
  const period = usePeriod();
  const now = new Date();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  const wk = weekRange();
  const isWeek = period.modo === "range" && period.from === wk.from && period.to === wk.to;
  const isMonth = period.modo === "mes" && period.ano === now.getFullYear() && period.mes === now.getMonth();
  const isCustom = !isWeek && !isMonth;

  // Personalizado: duração + mês de referência (único).
  const [dur, setDur] = React.useState(1);
  const [mesRef, setMesRef] = React.useState<YM>({ y: now.getFullYear(), m: now.getMonth() });

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // opções de mês: 12 à FRENTE (projeção) + atual + 24 atrás. Futuro → passado.
  const opts: YM[] = [];
  for (let i = 12; i >= -23; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    opts.push({ y: d.getFullYear(), m: d.getMonth() });
  }

  // Aplica a janela: N meses TERMINANDO no mês de referência.
  const aplicar = (n: number, end: YM) => {
    const sd = new Date(end.y, end.m - (n - 1), 1);
    period.setRange(firstDay(sd.getFullYear(), sd.getMonth()), lastDay(end.y, end.m));
  };

  // FLAT: ativo = pill ink discreto · inativo = só texto (sem borda/bg/sombra)
  const btn = (ativo: boolean) =>
    `inline-flex items-center h-9 px-4 rounded-pill text-[15px] font-medium transition-colors ${ativo ? "bg-ink text-white" : "bg-transparent text-muted hover:text-ink"}`;

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-2">
        <button className={btn(isWeek)} onClick={() => { period.setRange(wk.from, wk.to); setOpen(false); }}>Essa semana</button>
        <button className={btn(isMonth)} onClick={() => { period.setMonth(now.getFullYear(), now.getMonth()); setOpen(false); }}>Mês atual</button>
        <button className={btn(isCustom || open)} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <Icon name="chevron-down" size={15} color={isCustom || open ? "#fff" : "var(--color-text-secondary)"} className="-ml-1 mr-1" />
          {isCustom ? period.label : "Personalizado"}
        </button>
      </div>

      {open && (
        <div className="absolute right-0 mt-2 z-50 w-[300px] bg-white rounded-card p-4 flex flex-col gap-3">
          <span className="text-caption font-medium text-muted">Duração</span>
          <div className="flex flex-wrap gap-2">
            {DURACOES.map((n) => (
              <button
                key={n}
                onClick={() => { setDur(n); aplicar(n, mesRef); }}
                className={`text-caption font-medium rounded-pill px-3 py-[6px] transition-colors ${dur === n ? "bg-ink text-white" : "bg-surface-2 text-muted hover:text-ink"}`}
              >
                {n} {n === 1 ? "mês" : "meses"}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1 pt-1">
            <span className="text-caption text-faint">{dur === 1 ? "Mês de consulta" : "Mês de referência (fim)"}</span>
            <MonthDropdown value={mesRef} options={opts} onChange={(ym) => { setMesRef(ym); aplicar(dur, ym); }} />
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

/** Dropdown de mês no DS do sistema (substitui o <select> nativo genérico). */
function MonthDropdown({ value, options, onChange }: { value: YM; options: YM[]; onChange: (v: YM) => void }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 h-10 px-3 rounded-pill bg-surface-2 text-[15px] text-ink hover:bg-surface-3 transition-colors"
      >
        <span className="capitalize">{mesLabel(value)}</span>
        <Icon name="chevron-down" size={15} color="var(--color-text-secondary)" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 mt-1 z-50 max-h-[224px] overflow-y-auto bg-white rounded-card py-1">
          {options.map((o) => {
            const on = encode(o) === encode(value);
            return (
              <button
                key={encode(o)}
                type="button"
                onClick={() => { onChange(o); setOpen(false); }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-[15px] text-left transition-colors ${on ? "bg-lime-tint text-ink font-semibold" : "text-muted hover:bg-surface-1"}`}
              >
                <span className="capitalize flex-1">{mesLabel(o)}</span>
                {on && <Icon name="check" size={15} color="var(--color-ink)" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
