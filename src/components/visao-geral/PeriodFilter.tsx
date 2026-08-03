"use client";

/**
 * Filtro de período da Home (header) — duas pílulas: "Essa semana" e o MÊS
 * selecionado. A segunda abre o painel, onde se escolhe a janela.
 *
 * A janela tem duas leituras da MESMA coisa: a duração (1/2/3/6/12 meses) e o
 * par início–fim. Elas ficam em sincronia — mexer numa reescreve a outra —
 * porque duas leituras que divergem fazem a tela mostrar um período e o
 * relatório calcular outro.
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
/** Índice absoluto de mês — deixa comparar e somar meses sem `Date`. */
const idx = (v: YM) => v.y * 12 + v.m;
const deIdx = (n: number): YM => ({ y: Math.floor(n / 12), m: n % 12 });
/** Quantos meses a janela cobre, contando as duas pontas. */
const duracaoEntre = (a: YM, b: YM) => idx(b) - idx(a) + 1;

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

  const atual: YM = { y: now.getFullYear(), m: now.getMonth() };
  const [inicio, setInicio] = React.useState<YM>(atual);
  const [fim, setFim] = React.useState<YM>(atual);
  const dur = Math.max(1, duracaoEntre(inicio, fim));

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  /**
   * As opções vão do mês CORRENTE para trás, 36 meses.
   *
   * ⚠️ Sem mês futuro. O painel oferecia doze meses à frente e a lista abria em
   * "ago/27" — um mês que ainda não aconteceu, e cuja consulta só pode devolver
   * vazio. Projeção é outra tela (fluxo de caixa); aqui se consulta o que já é.
   */
  const opts: YM[] = [];
  for (let i = 0; i >= -35; i--) opts.push(deIdx(idx(atual) + i));

  /** Aplica a janela no contexto — 1 mês entra como MÊS, o resto como range. */
  const aplicar = React.useCallback((a: YM, b: YM) => {
    if (encode(a) === encode(b)) { period.setMonth(b.y, b.m); return; }
    period.setRange(firstDay(a.y, a.m), lastDay(b.y, b.m));
  }, [period]);

  /** Pílula de duração: mantém o FIM e recua o início — é a leitura natural. */
  function escolherDuracao(n: number) {
    const novoInicio = deIdx(idx(fim) - (n - 1));
    setInicio(novoInicio);
    aplicar(novoInicio, fim);
  }

  function mudarInicio(v: YM) {
    // Início depois do fim inverteria a janela; empurra o fim junto.
    const novoFim = idx(v) > idx(fim) ? v : fim;
    setInicio(v); setFim(novoFim);
    aplicar(v, novoFim);
  }

  function mudarFim(v: YM) {
    const novoInicio = idx(v) < idx(inicio) ? v : inicio;
    setFim(v); setInicio(novoInicio);
    aplicar(novoInicio, v);
  }

  const btnStyle: React.CSSProperties = {
    fontFamily: '"Roobert Variable", "Roobert", sans-serif',
    fontWeight: 400,
    letterSpacing: "-0.02em",
  };
  const btn = (ativo: boolean) =>
    `inline-flex items-center h-9 px-[18px] rounded-pill text-[16px] transition-colors ${ativo ? "bg-white text-ink" : "bg-transparent text-muted hover:text-ink"}`;

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-2">
        <button style={btnStyle} className={btn(isWeek)} onClick={() => { period.setRange(wk.from, wk.to); setOpen(false); }}>Essa semana</button>
        <button
          style={btnStyle}
          className={`${btn(isMonth || isCustom || open)} gap-2`}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <span>{period.label}</span>
          {/* ⚠️ A seta fica SEMPRE, inclusive com a pílula selecionada. Ela é o
              que diz que o botão abre algo — some, e o mês vira um rótulo que
              ninguém tenta clicar. */}
          <Icon
            name="chevron-down"
            size={15}
            color="currentColor"
            className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {open && (
        <div className="absolute right-0 mt-2 z-50 w-[320px] bg-white rounded-card p-4 flex flex-col gap-3 border border-border-soft">
          <div className="flex flex-col gap-2">
            <span className="text-caption text-faint">Duração</span>
            <div className="flex flex-wrap gap-2">
              {DURACOES.map((n) => (
                <button
                  key={n}
                  onClick={() => escolherDuracao(n)}
                  className={`text-caption font-medium rounded-pill px-3 py-[6px] transition-colors ${dur === n ? "bg-surface-3 text-ink font-semibold" : "bg-surface-2 text-muted hover:text-ink"}`}
                >
                  {n} {n === 1 ? "mês" : "meses"}
                </button>
              ))}
            </div>
          </div>

          {dur === 1 ? (
            <div className="flex flex-col gap-1">
              <span className="text-caption font-medium text-muted">Mês de consulta</span>
              <MonthDropdown value={fim} options={opts} onChange={(ym) => { setInicio(ym); setFim(ym); aplicar(ym, ym); }} />
            </div>
          ) : (
            // Janela de mais de um mês: os DOIS extremos ficam visíveis e
            // editáveis. Só o mês final deixava o começo da janela implícito —
            // quem precisa de "março a agosto" tinha de contar meses de cabeça.
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-caption font-medium text-muted">Mês inicial</span>
                <MonthDropdown value={inicio} options={opts} onChange={mudarInicio} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-caption font-medium text-muted">Mês final</span>
                <MonthDropdown value={fim} options={opts} onChange={mudarFim} />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-caption text-faint">{period.label}</span>
            <button onClick={() => setOpen(false)} className="text-caption font-medium text-ink hover:underline">Pronto</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Dropdown de mês no DS do sistema (substitui o `<select>` nativo genérico). */
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
        <span className="capitalize truncate">{mesLabel(value)}</span>
        <Icon name="chevron-down" size={15} color="var(--color-text-secondary)" className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 mt-1 z-50 max-h-[224px] overflow-y-auto bg-white rounded-card py-1 border border-border-soft">
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
