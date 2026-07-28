"use client";

/**
 * Extrato de transações — o painel do topo de **Receber** e **Pagar**, no
 * modelo da referência enviada:
 *
 *  1. **Carrossel de períodos** — um card por MÊS (ou por SEMANA, pelo botão
 *     Mês/Semana) com o resultado líquido daquele período, verde ou vermelho,
 *     e uma linha ligando os pontos por cima dos cards. Clicar seleciona o
 *     período; as setas rolam a faixa.
 *  2. **Barra de resumo** do período selecionado — contagem, entradas, saídas
 *     e resultado.
 *  3. **Lista agrupada por dia** ("Hoje" · "Ontem" · "dom, jul 26"), com a
 *     conta, a descrição, o chip de categoria e o valor.
 *
 * `direction` decide o que a LISTA mostra (entradas na página Receber, saídas
 * na Pagar); o carrossel e o resumo continuam mostrando os dois lados, porque
 * o resultado do período só faz sentido com entradas e saídas juntas.
 *
 * Puro sobre o `RiskInput` — roda igual em demo e em live.
 */
import * as React from "react";
import { Card, Icon, Input, InfoHint } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import { useRiscoInput, useAccounts } from "@/components/visao-geral/hooks";
import type { RiskMovement } from "@/core/risk-engine/types";

const POSITIVE = "var(--color-positive)";
const NEGATIVE = "var(--color-negative)";
const MES_ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DIA_ABBR = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** Paleta dos chips de categoria — tons do próprio DS, não matizes avulsos. */
const CHIP = ["#C8E600", "#93B300", "#5F7D1F", "#3F5A22", "#8A876F", "#B4B0A0", "#6B6A5A", "#11190C"];
const corDaCategoria = (nome: string) => {
  let h = 0;
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0;
  return CHIP[h % CHIP.length];
};

type Gran = "mes" | "semana";

/** Data de caixa do movimento (pago → pagamento; pendente → vencimento). */
const dataDe = (m: RiskMovement) => (m.status === "pago" ? m.paid_date || m.due_date : m.due_date).slice(0, 10);

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Parser seguro de data-só: `new Date("2026-07-28")` é meia-noite UTC. */
const parse = (s: string) => new Date(s.slice(0, 10) + "T00:00:00");

interface Periodo { key: string; label: string; de: string; ate: string; entradas: number; saidas: number; resultado: number }

/** Últimos 12 meses (ou 12 semanas) terminando no de hoje, do mais antigo ao atual. */
function montarPeriodos(hojeISO: string, gran: Gran): Periodo[] {
  const hoje = parse(hojeISO);
  const out: Periodo[] = [];
  for (let i = 11; i >= 0; i--) {
    if (gran === "mes") {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      out.push({
        key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`,
        label: `${MESES[d.getMonth()]}${d.getFullYear() !== hoje.getFullYear() ? ` '${String(d.getFullYear()).slice(2)}` : ""}`,
        de: iso(d), ate: iso(fim), entradas: 0, saidas: 0, resultado: 0,
      });
    } else {
      const dom = new Date(hoje); dom.setDate(hoje.getDate() - hoje.getDay() - i * 7);
      const sab = new Date(dom); sab.setDate(dom.getDate() + 6);
      out.push({
        key: `w-${iso(dom)}`,
        label: `${dom.getDate()}/${MES_ABBR[dom.getMonth()]} – ${sab.getDate()}/${MES_ABBR[sab.getMonth()]}`,
        de: iso(dom), ate: iso(sab), entradas: 0, saidas: 0, resultado: 0,
      });
    }
  }
  return out;
}

/** Cabeçalho de dia: "Hoje" · "Ontem" · "dom, jul 26". */
function rotuloDia(diaISO: string, hojeISO: string): string {
  if (diaISO === hojeISO) return "Hoje";
  const h = parse(hojeISO); h.setDate(h.getDate() - 1);
  if (diaISO === iso(h)) return "Ontem";
  const d = parse(diaISO);
  return `${DIA_ABBR[d.getDay()]}, ${MES_ABBR[d.getMonth()]} ${d.getDate()}`;
}

export function ExtratoTransacoes({ direction }: { direction: "entrada" | "saida" }) {
  const { data: inp, isLoading } = useRiscoInput();
  const contas = useAccounts();
  const [gran, setGran] = React.useState<Gran>("mes");
  const [selKey, setSelKey] = React.useState<string | null>(null);
  const [busca, setBusca] = React.useState("");
  const faixaRef = React.useRef<HTMLDivElement>(null);

  const hoje = inp?.hoje?.slice(0, 10) ?? iso(new Date());

  // Períodos com entradas/saídas somadas — a base do carrossel.
  const periodos = React.useMemo(() => {
    const ps = montarPeriodos(hoje, gran);
    if (!inp) return ps;
    for (const m of inp.movements) {
      if (m.status === "cancelado") continue;
      const d = dataDe(m);
      const p = ps.find((x) => d >= x.de && d <= x.ate);
      if (!p) continue;
      if (m.type === "entrada") p.entradas += m.amount; else p.saidas += m.amount;
    }
    for (const p of ps) p.resultado = p.entradas - p.saidas;
    return ps;
  }, [inp, hoje, gran]);

  // Trocar de granularidade invalida a seleção antiga (as chaves mudam) e
  // recoloca a faixa no período ATUAL — ela é montada do mais antigo para o
  // mais novo, então sem isso o carrossel abre 12 meses atrás.
  React.useEffect(() => { setSelKey(null); }, [gran]);
  // A faixa é montada do período mais ANTIGO para o mais novo, então sem isto
  // o carrossel abre 12 meses atrás. O rAF é necessário: no efeito síncrono o
  // conteúdo ainda não foi medido e `scrollWidth` sai igual a `clientWidth`.
  React.useLayoutEffect(() => {
    const id = requestAnimationFrame(() => {
      const el = faixaRef.current;
      if (el) el.scrollLeft = el.scrollWidth;
    });
    return () => cancelAnimationFrame(id);
    // `isLoading` entra nas deps de propósito: enquanto carrega o card devolve
    // um placeholder e a faixa nem existe no DOM, então o efeito precisa rodar
    // DE NOVO quando os dados chegam.
  }, [gran, periodos.length, isLoading]);
  const sel = periodos.find((p) => p.key === selKey) ?? periodos[periodos.length - 1];

  // Lançamentos do período selecionado, no lado da página, agrupados por dia.
  const grupos = React.useMemo(() => {
    if (!inp || !sel) return [] as { dia: string; rotulo: string; itens: RiskMovement[] }[];
    const termo = busca.trim().toLowerCase();
    const nome = (m: RiskMovement) => (m.party_id && inp.partyNames?.[m.party_id]) || m.category || (m.type === "entrada" ? "Recebimento" : "Pagamento");
    const lista = inp.movements
      .filter((m) => m.status !== "cancelado" && m.type === direction)
      .filter((m) => { const d = dataDe(m); return d >= sel.de && d <= sel.ate; })
      .filter((m) => !termo || nome(m).toLowerCase().includes(termo) || (m.category ?? "").toLowerCase().includes(termo))
      .sort((a, b) => dataDe(b).localeCompare(dataDe(a)));
    const map = new Map<string, RiskMovement[]>();
    for (const m of lista) {
      const d = dataDe(m);
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(m);
    }
    return Array.from(map.entries()).map(([dia, itens]) => ({ dia, rotulo: rotuloDia(dia, hoje), itens }));
  }, [inp, sel, direction, busca, hoje]);

  const totalItens = grupos.reduce((s, g) => s + g.itens.length, 0);
  const nomeConta = React.useCallback((id?: string | null) => {
    const c = contas.data?.accounts.find((x) => x.id === id);
    return c?.name ?? "—";
  }, [contas.data]);

  if (isLoading || !inp) {
    return <Card><span className="text-caption text-faint">Carregando transações…</span></Card>;
  }

  const rolar = (dir: 1 | -1) => faixaRef.current?.scrollBy({ left: dir * 340, behavior: "smooth" });

  return (
    <Card className="flex flex-col gap-0" padded={false} info={{
      titulo: "Transações",
      oQue: "O extrato do período: o resultado de cada mês (ou semana) na faixa de cima e, abaixo, os lançamentos dia a dia.",
      comoCalcula: "Cada período soma entradas e saídas pela data de caixa (pagamento quando liquidado, vencimento quando pendente). O resultado é entradas − saídas; a lista mostra só o lado da página.",
    }}>
      {/* Topo — busca + granularidade */}
      <div className="flex items-center justify-end gap-2 px-5 pt-5 pb-3 flex-wrap">
        <div className="inline-flex rounded-pill bg-surface-2 p-[3px]" role="tablist" aria-label="Granularidade">
          {([["mes", "Mês"], ["semana", "Semana"]] as const).map(([id, label]) => (
            <button
              key={id} role="tab" aria-selected={gran === id} onClick={() => setGran(id)}
              className={`rounded-pill px-4 py-[6px] text-caption font-medium transition-colors ${gran === id ? "bg-white text-ink" : "text-muted hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="w-[240px]">
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar transações…" aria-label="Buscar transações" />
        </div>
      </div>

      {/* Carrossel de períodos com a linha do resultado por cima */}
      <div className="relative">
        <button
          onClick={() => rolar(-1)} aria-label="Períodos anteriores"
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-pill bg-white border border-border inline-flex items-center justify-center text-muted hover:text-ink"
        >
          <Icon name="chevron-left" size={16} color="currentColor" />
        </button>
        <button
          onClick={() => rolar(1)} aria-label="Próximos períodos"
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-pill bg-white border border-border inline-flex items-center justify-center text-muted hover:text-ink"
        >
          <Icon name="chevron-right" size={16} color="currentColor" />
        </button>
        <div ref={faixaRef} className="overflow-x-auto px-12 pb-4">
          <FaixaPeriodos periodos={periodos} selKey={sel?.key} onSelect={setSelKey} />
        </div>
      </div>

      {/* Resumo do período selecionado */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-b border-border-soft flex-wrap">
        <span className="inline-flex items-center gap-2 text-[15px] font-medium text-ink">
          <Icon name="trending-up" size={16} color="var(--color-text-secondary)" />
          {direction === "saida" ? "Gastos por categoria" : "Entradas por categoria"}
          <InfoHint align="left"
            oQue="As categorias que mais pesam no período selecionado."
            comoCalcula="Soma dos lançamentos do período por categoria, no lado desta página." />
        </span>
        <div className="flex items-center gap-4 flex-wrap text-[14px] tabular-nums">
          <span className="inline-flex items-center gap-[6px] text-muted bg-surface-2 rounded-pill px-3 py-[3px]">
            <Icon name="calendar" size={13} color="currentColor" />{sel?.label}
          </span>
          <span className="text-muted">{totalItens} lançamento{totalItens === 1 ? "" : "s"}</span>
          <span className="inline-flex items-center gap-[5px]" style={{ color: POSITIVE }}>
            <Icon name="arrow-down-to-line" size={13} color="currentColor" />{formatBRL(sel?.entradas ?? 0)}
          </span>
          <span className="inline-flex items-center gap-[5px]" style={{ color: NEGATIVE }}>
            <Icon name="arrow-up-right" size={13} color="currentColor" />{formatBRL(sel?.saidas ?? 0)}
          </span>
          <span className="font-medium" style={{ color: (sel?.resultado ?? 0) < 0 ? NEGATIVE : POSITIVE }}>
            {(sel?.resultado ?? 0) < 0 ? "−" : ""}{formatBRL(Math.abs(sel?.resultado ?? 0))}
          </span>
        </div>
      </div>

      {/* Lista agrupada por dia */}
      {grupos.length === 0 ? (
        <div className="px-5 py-8 text-center text-caption text-faint">
          Nenhum lançamento no período selecionado.
        </div>
      ) : (
        <div className="flex flex-col">
          {grupos.map((g) => (
            <div key={g.dia} className="flex flex-col">
              <div className="px-5 pt-5 pb-2 text-[12px] font-medium uppercase tracking-[0.08em] text-faint">{g.rotulo}</div>
              {g.itens.map((m) => {
                const nome = (m.party_id && inp.partyNames?.[m.party_id]) || m.category || (m.type === "entrada" ? "Recebimento" : "Pagamento");
                const cat = m.category || "Outros";
                const pid = m.party_id;
                const abrir = () => pid && window.dispatchEvent(new CustomEvent("a4p:open-contato", { detail: { id: pid } }));
                return (
                  <button
                    key={m.id} type="button" onClick={abrir} disabled={!pid}
                    className={`grid grid-cols-[auto_1fr_auto_auto] gap-3 items-center px-5 py-[10px] border-t border-border-soft text-left ${pid ? "hover:bg-surface-1 transition-colors cursor-pointer" : "cursor-default"}`}
                  >
                    <span className="text-[12px] font-semibold text-muted bg-surface-2 rounded-sm px-[6px] py-[2px] shrink-0">
                      {nomeConta(m.accountId).slice(0, 6)}
                    </span>
                    <span className="text-[15px] text-ink truncate">{nome}</span>
                    <span className="inline-flex items-center gap-[6px] text-[13px] text-muted bg-surface-2 rounded-pill px-[10px] py-[3px] shrink-0">
                      <span className="w-2 h-2 rounded-pill" style={{ background: corDaCategoria(cat) }} />
                      {cat}
                    </span>
                    <span className="text-[15px] tabular-nums text-ink shrink-0 whitespace-nowrap w-[120px] text-right">
                      {formatBRL(m.amount)}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/**
 * A faixa de períodos: uma coluna por período e, POR CIMA, a linha que liga os
 * resultados. A linha vive num SVG absoluto do tamanho da faixa — em vez de um
 * gráfico separado, para os pontos caírem exatamente sobre cada card.
 */
function FaixaPeriodos({ periodos, selKey, onSelect }: { periodos: Periodo[]; selKey?: string; onSelect: (k: string) => void }) {
  const LARG = 150, ALT = 74;
  const total = periodos.length * LARG;
  const vals = periodos.map((p) => p.resultado);
  const max = Math.max(...vals, 0), min = Math.min(...vals, 0);
  const span = max - min || 1;
  const y = (v: number) => 12 + (1 - (v - min) / span) * (ALT - 24);
  const pontos = periodos.map((p, i) => ({ x: i * LARG + LARG / 2, y: y(p.resultado), key: p.key }));
  const d = pontos.map((pt, i) => `${i ? "L" : "M"}${pt.x},${pt.y}`).join(" ");

  return (
    <div className="relative" style={{ width: total }}>
      <svg width={total} height={ALT} className="absolute inset-x-0 top-0 pointer-events-none" aria-hidden>
        <path d={d} fill="none" stroke="var(--color-chart-line)" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
        {pontos.map((pt) => (
          <circle key={pt.key} cx={pt.x} cy={pt.y} r={pt.key === selKey ? 4.5 : 3} fill="#fff" stroke="var(--color-chart-line)" strokeWidth={1.4} />
        ))}
      </svg>
      <div className="flex" style={{ paddingTop: ALT }}>
        {periodos.map((p) => {
          const on = p.key === selKey;
          // Zero é NEUTRO: pintar de verde um período sem movimento diz que
          // foi bom quando não houve nada.
          const cor = p.resultado === 0 ? "var(--color-text-tertiary)" : p.resultado > 0 ? POSITIVE : NEGATIVE;
          return (
            <button
              key={p.key} onClick={() => onSelect(p.key)} aria-pressed={on}
              className={`shrink-0 flex flex-col items-center gap-1 rounded-[14px] py-3 transition-colors ${on ? "bg-surface-2" : "hover:bg-surface-1"}`}
              style={{ width: LARG }}
            >
              <span className="text-[14px] text-muted truncate max-w-full px-2">{p.label}</span>
              <span className="text-[17px] font-medium tabular-nums" style={{ color: cor }}>
                {p.resultado < 0 ? "−" : ""}{formatBRL(Math.abs(p.resultado))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
