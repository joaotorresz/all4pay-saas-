"use client";

import * as React from "react";
import { Icon, Button } from "@/components/ui";
import { usePeriod, MES_ABBR } from "./PeriodContext";

const SPANS = [45, 60, 90];
const pad = (n: number) => String(n).padStart(2, "0");

/** Opções de mês: 12 atrás → 12 à frente (value "ano-mes", 0-based). */
function mesesOpcoes(): { value: string; label: string }[] {
  const now = new Date();
  const out: { value: string; label: string }[] = [];
  for (let i = -12; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    out.push({ value: `${d.getFullYear()}-${d.getMonth()}`, label: `${MES_ABBR[d.getMonth()]}/${d.getFullYear()}` });
  }
  return out;
}
const firstDay = (v: string) => { const [a, m] = v.split("-").map(Number); return `${a}-${pad(m + 1)}-01`; };
const lastDay = (v: string) => { const [a, m] = v.split("-").map(Number); const d = new Date(a, m + 1, 0); return `${a}-${pad(m + 1)}-${pad(d.getDate())}`; };

/** Seletor de PERÍODO (range) à esquerda do seletor de mês: escolhe 45/60/90
 *  dias e então o mês de começo e o de fim → define a janela global da Home. */
export function RangeSelector() {
  const p = usePeriod();
  const opcoes = React.useMemo(mesesOpcoes, []);
  const [aberto, setAberto] = React.useState(false);
  const [span, setSpan] = React.useState<number | null>(null);
  const [comeco, setComeco] = React.useState<string>(`${new Date().getFullYear()}-${new Date().getMonth()}`);
  const [fim, setFim] = React.useState<string>(comeco);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Ao escolher o span, pré-preenche o mês de fim = começo + N dias.
  const escolherSpan = (dias: number) => {
    setSpan(dias);
    const [a, m] = comeco.split("-").map(Number);
    const d = new Date(a, m, 1); d.setDate(d.getDate() + dias);
    setFim(`${d.getFullYear()}-${d.getMonth()}`);
  };

  const aplicar = () => {
    let from = firstDay(comeco); let to = lastDay(fim);
    if (from > to) { const t = from; from = firstDay(fim); to = lastDay(comeco); void t; }
    p.setRange(from, to);
    setAberto(false);
  };

  const ativo = p.modo === "range";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAberto((v) => !v)}
        className={`inline-flex items-center gap-1 rounded-md border px-3 h-[34px] text-label ${ativo ? "border-ink text-ink bg-surface-2" : "border-border text-muted bg-white hover:text-ink"}`}
      >
        <Icon name="activity" size={14} color="var(--color-text-secondary)" />
        {ativo ? p.label : "Período"}
        <Icon name="chevron-down" size={14} color="var(--color-text-tertiary)" />
      </button>

      {aberto && (
        <div className="absolute z-[70] mt-1 left-0 w-[260px] rounded-md border border-border bg-white shadow-popover p-3 flex flex-col gap-3">
          {/* Volta rápida para o mês corrente (sai de qualquer range). */}
          <button
            onClick={() => { const n = new Date(); p.setMonth(n.getFullYear(), n.getMonth()); setSpan(null); setAberto(false); }}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-border px-3 h-9 text-label text-ink hover:bg-surface-2"
          >
            <Icon name="house" size={14} color="var(--color-text-secondary)" />
            Mês atual
          </button>
          <div className="h-px bg-border-soft" />
          <span className="text-caption font-medium text-muted">Janela personalizada</span>
          <div className="inline-flex rounded-md bg-surface-2 p-[3px]">
            {SPANS.map((s) => (
              <button key={s} onClick={() => escolherSpan(s)} className={`flex-1 rounded-[7px] px-2 py-[6px] text-caption ${span === s ? "bg-white text-ink font-medium shadow-pill" : "text-muted hover:text-ink"}`}>{s} dias</button>
            ))}
          </div>

          {span && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-caption text-faint">Mês de começo</span>
                <select value={comeco} onChange={(e) => setComeco(e.target.value)} className="rounded-md border border-border bg-white px-2 h-9 text-label text-ink">
                  {opcoes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-caption text-faint">Mês de fim</span>
                <select value={fim} onChange={(e) => setFim(e.target.value)} className="rounded-md border border-border bg-white px-2 h-9 text-label text-ink">
                  {opcoes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <Button variant="primary" size="sm" fullWidth onClick={aplicar}>Aplicar período</Button>
            </>
          )}
          {!span && <span className="text-caption text-faint">Escolha a janela e depois o mês de começo e o de fim.</span>}
        </div>
      )}
    </div>
  );
}
