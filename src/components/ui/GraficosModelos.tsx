"use client";

import * as React from "react";
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Cell, Line, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, PieChart, Pie, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ReferenceArea,
} from "recharts";
import { DegradeArea, DicaGrafico, type LinhaDica } from "./Grafico";
import { BRL } from "./BRL";
import { chartAnim } from "@/lib/chart-anim";
import { RAIO_TOPO, SERIES, COMPARACAO, tickBRL } from "@/lib/grafico";
import { COR_ENTRADA, COR_SAIDA } from "./GraficosBiblioteca";
import { tx } from "@/design/escala-texto";

/**
 * O resto da Biblioteca do canvas "Quattro ERP · Gráficos e tabelas"
 * (16/10/2026): os modelos que ainda não tinham peça no código. Cada função
 * leva o NOME do modelo no canvas, como em `GraficosBiblioteca.tsx`:
 *
 *   · `BarrasHorizontais`  ← "Receita 3"
 *   · `BarrasPareadas`     ← "Análises 1"
 *   · `PizzaFatias`        ← "Histórico de transferências 1"
 *   · `RoscaFatias`        ← "Histórico de transferências 2"
 *   · `RoscaCentro`        ← "Receita por linha"
 *   · `Medidores`          ← "Atividade"
 *   · `BlocosProporcao`    ← "Relatório de transações"
 *   · `RadarSeries`        ← "Estatística"
 *   · `AreaPorAno`         ← "Estatística de saldo 2"
 *   · `DuasBarras`         ← "Dinheiro poupado 1"
 *   · `MetaCirculo`        ← "Dinheiro poupado 2"
 *   · `ListaProgresso`     ← "Média de despesas"
 *   · `LinhaPontos`        ← "Saldo em conta"
 *   · `BarrasAgrupadas`    ← "Entradas × saídas"
 *   · `Velas`              ← "Velas · entradas × saídas"
 *   · `ColunasPreco`       ← "Análise de preço 1"
 *
 * As cores saem SÓ dos tokens (`--erp-graf-serie-*`, entrada e saída). ⚠️
 * Nenhuma cor é decidida comparando um número com zero (guarda `cor:`); nas
 * velas a cor é da SÉRIE — a vela de alta e a de baixa chegam separadas.
 */

const EIXO = { fontSize: tx(11), fill: "var(--color-text-secondary)" };
const GRADE = "var(--erp-graf-grade)";
const CURSOR = { fill: "rgba(127,127,127,0.06)" };
const TRILHO = "var(--color-surface-2)";

function variacaoContra(atual: number, anterior: number | undefined): number | null {
  if (anterior == null || anterior === 0) return null;
  return (atual - anterior) / Math.abs(anterior);
}

const pctTexto = (f: number) => `${Math.round(f * 100)}%`;

/** A legenda em pontos (a mesma dos modelos de linha). */
export function LegendaPontos({ itens }: { itens: { cor: string; nome: string; detalhe?: React.ReactNode }[] }) {
  return (
    <div className="flex items-center gap-4 flex-wrap mb-2">
      {itens.map((i) => (
        <span key={i.nome} className="inline-flex items-center gap-[6px] text-[12px] text-muted">
          <span aria-hidden className="w-[8px] h-[8px] rounded-[3px]" style={{ background: i.cor }} />
          {i.nome}
          {i.detalhe != null && <span className="text-ink tabular-nums">{i.detalhe}</span>}
        </span>
      ))}
    </div>
  );
}

/* ============================== "Receita 3" ============================== */
export interface ItemBarra { chave: string; nome: string; valor: number; detalhe?: React.ReactNode }

/** Barras deitadas sobre um trilho: o comprimento é o valor contra o maior. */
export function BarrasHorizontais({ itens, ariaLabel, formatar }: {
  itens: ItemBarra[]; ariaLabel: string; formatar?: (v: number) => React.ReactNode;
}) {
  const max = Math.max(1, ...itens.map((i) => Math.abs(i.valor)));
  return (
    <div role="img" aria-label={ariaLabel} className="flex flex-col gap-3">
      {itens.map((i) => (
        <div key={i.chave} className="grid items-center gap-3" style={{ gridTemplateColumns: "minmax(64px, 30%) 1fr auto" }}>
          <span className="text-[12px] text-muted truncate" title={i.nome}>{i.nome}</span>
          <span className="h-[10px] rounded-pill overflow-hidden" style={{ background: TRILHO }}>
            <span className="block h-full rounded-pill" style={{ width: `${(Math.abs(i.valor) / max) * 100}%`, background: "var(--erp-graf-serie-1)" }} />
          </span>
          <span className="text-[12px] text-ink tabular-nums">{i.detalhe ?? (formatar ? formatar(i.valor) : <BRL value={i.valor} />)}</span>
        </div>
      ))}
    </div>
  );
}

/* ============================== "Análises 1" ============================== */
export interface PontoPar { label: string; entrada: number; saida: number }

/** Duas barras finas lado a lado por período: entradas e saídas. */
export function BarrasPareadas({ dados, altura = 220, ariaLabel, rotuloEntrada = "Entradas", rotuloSaida = "Saídas" }: {
  dados: PontoPar[]; altura?: number; ariaLabel: string; rotuloEntrada?: string; rotuloSaida?: string;
}) {
  return (
    <div role="img" aria-label={ariaLabel}>
      <LegendaPontos itens={[{ cor: COR_ENTRADA, nome: rotuloEntrada }, { cor: COR_SAIDA, nome: rotuloSaida }]} />
      <ResponsiveContainer width="100%" height={altura}>
        <BarChart data={dados} barGap={3} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={GRADE} vertical={false} />
          <XAxis dataKey="label" tick={EIXO} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={EIXO} tickLine={false} axisLine={false} width={64} tickFormatter={tickBRL} />
          <Tooltip cursor={CURSOR} content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as PontoPar;
            return <DicaGrafico rotulo={String(label)} linhas={[
              { cor: COR_ENTRADA, nome: rotuloEntrada, valor: p.entrada },
              { cor: COR_SAIDA, nome: rotuloSaida, valor: p.saida },
            ]} rodape={<>Resultado <BRL value={p.entrada - p.saida} /></>} />;
          }} />
          <Bar dataKey="entrada" name={rotuloEntrada} fill={COR_ENTRADA} radius={[3, 3, 0, 0]} maxBarSize={8} {...chartAnim()} />
          <Bar dataKey="saida" name={rotuloSaida} fill={COR_SAIDA} radius={[3, 3, 0, 0]} maxBarSize={8} {...chartAnim(120)} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ====================== fatias (pizza, rosca, rosca com centro) ====================== */
export interface Fatia { chave: string; nome: string; valor: number; cor?: string }

function comCores(fatias: Fatia[]): (Fatia & { cor: string; fracao: number })[] {
  const total = fatias.reduce((s, f) => s + Math.max(0, f.valor), 0);
  return fatias.map((f, i) => ({ ...f, cor: f.cor ?? SERIES[i % SERIES.length], fracao: total > 0 ? Math.max(0, f.valor) / total : 0 }));
}

function DicaFatia({ active, payload }: { active?: boolean; payload?: { payload: Fatia & { fracao: number } }[] }) {
  if (!active || !payload?.length) return null;
  const f = payload[0].payload;
  return <DicaGrafico rotulo={`${f.nome} · ${pctTexto(f.fracao)}`} valor={f.valor} />;
}

function rotuloPct(props: { cx: number; cy: number; midAngle: number; innerRadius: number; outerRadius: number; fracao: number }) {
  const { cx, cy, midAngle, innerRadius, outerRadius, fracao } = props;
  if (fracao < 0.06) return null;
  const r = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + r * Math.cos((-midAngle * Math.PI) / 180);
  const y = cy + r * Math.sin((-midAngle * Math.PI) / 180);
  return (
    <g>
      <rect x={x - 15} y={y - 8} width={30} height={16} rx={8} fill="var(--color-white)" />
      <text x={x} y={y + 3.5} textAnchor="middle" fontSize={tx(9)} fill="var(--color-ink)" className="tabular-nums">{pctTexto(fracao)}</text>
    </g>
  );
}

function LegendaFatias({ fatias, comValor }: { fatias: (Fatia & { cor: string; fracao: number })[]; comValor?: boolean }) {
  return (
    <div className="flex flex-col gap-2 min-w-0">
      {fatias.map((f) => (
        <span key={f.chave} className="inline-flex items-center gap-2 text-[12px] text-muted min-w-0">
          <span aria-hidden className="w-[8px] h-[8px] rounded-[2px] shrink-0" style={{ background: f.cor }} />
          <span className="truncate">{f.nome}</span>
          <span className="ml-auto text-ink tabular-nums pl-2">{comValor ? <BRL value={f.valor} /> : pctTexto(f.fracao)}</span>
        </span>
      ))}
    </div>
  );
}

/** "Histórico de transferências 1": pizza cheia, % sobre as fatias, legenda à esquerda. */
export function PizzaFatias({ fatias, ariaLabel, tamanho = 180 }: { fatias: Fatia[]; ariaLabel: string; tamanho?: number }) {
  const fs = comCores(fatias);
  return (
    <div role="img" aria-label={ariaLabel} className="flex items-center justify-between gap-4 flex-wrap">
      <LegendaFatias fatias={fs} />
      <div style={{ width: tamanho, height: tamanho }} className="shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<DicaFatia />} />
            <Pie data={fs} dataKey="valor" nameKey="nome" outerRadius="100%" stroke="var(--color-white)" strokeWidth={2}
              labelLine={false} label={rotuloPct as never} {...chartAnim()}>
              {fs.map((f) => <Cell key={f.chave} fill={f.cor} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** "Histórico de transferências 2": rosca fina em fatias separadas, % sobre elas. */
export function RoscaFatias({ fatias, ariaLabel, tamanho = 180 }: { fatias: Fatia[]; ariaLabel: string; tamanho?: number }) {
  const fs = comCores(fatias);
  return (
    <div role="img" aria-label={ariaLabel} className="flex items-center justify-between gap-4 flex-wrap">
      <LegendaFatias fatias={fs} />
      <div style={{ width: tamanho, height: tamanho }} className="shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<DicaFatia />} />
            <Pie data={fs} dataKey="valor" nameKey="nome" innerRadius="56%" outerRadius="100%" paddingAngle={3} cornerRadius={4}
              stroke="none" labelLine={false} label={rotuloPct as never} {...chartAnim()}>
              {fs.map((f) => <Cell key={f.chave} fill={f.cor} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** "Receita por linha": rosca grossa com o maior no centro, legenda com %. */
export function RoscaCentro({ fatias, ariaLabel, tamanho = 180, rotuloCentro }: {
  fatias: Fatia[]; ariaLabel: string; tamanho?: number; rotuloCentro?: string;
}) {
  const fs = comCores(fatias);
  const maior = fs.reduce<(typeof fs)[number] | null>((m, f) => (!m || f.valor > m.valor ? f : m), null);
  return (
    <div role="img" aria-label={ariaLabel} className="flex items-center justify-between gap-4 flex-wrap">
      <div style={{ width: tamanho, height: tamanho }} className="shrink-0 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<DicaFatia />} />
            <Pie data={fs} dataKey="valor" nameKey="nome" innerRadius="64%" outerRadius="100%" paddingAngle={2}
              stroke="none" startAngle={90} endAngle={-270} {...chartAnim()}>
              {fs.map((f) => <Cell key={f.chave} fill={f.cor} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {maior && (
          <span className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-6">
            <span className="text-[10px] text-muted truncate max-w-full">{rotuloCentro ?? maior.nome}</span>
            <span className="text-[14px] text-ink tabular-nums"><BRL value={maior.valor} compacto /></span>
          </span>
        )}
      </div>
      <div className="flex-1 min-w-[140px]"><LegendaFatias fatias={fs} /></div>
    </div>
  );
}

/* ============================== "Atividade" ============================== */
export interface Medidor { chave: string; rotulo: string; valor: React.ReactNode; fracao: number; cor?: string }

/** Três (ou mais) arcos pequenos com o número dentro e, embaixo, a barra da meta. */
export function Medidores({ medidores, meta, ariaLabel }: {
  medidores: Medidor[]; meta?: { fracao: number; texto: string }; ariaLabel: string;
}) {
  const r = 26, volta = 2 * Math.PI * r, arco = volta * 0.75;
  return (
    <div role="img" aria-label={ariaLabel} className="flex flex-col gap-5">
      <div className="flex items-start justify-around gap-3 flex-wrap">
        {medidores.map((m, i) => {
          const f = Math.max(0, Math.min(1, m.fracao));
          return (
            <div key={m.chave} className="relative w-[72px] h-[72px]">
              <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden>
                <g transform="rotate(135 36 36)">
                  <circle cx="36" cy="36" r={r} fill="none" stroke={TRILHO} strokeWidth="4" strokeDasharray={`${arco} ${volta}`} strokeLinecap="round" />
                  <circle cx="36" cy="36" r={r} fill="none" stroke={m.cor ?? SERIES[i % 3 === 1 ? 2 : 0]} strokeWidth="4"
                    strokeDasharray={`${arco * f} ${volta}`} strokeLinecap="round" />
                </g>
              </svg>
              <span className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[13px] text-ink tabular-nums leading-none">{m.valor}</span>
                <span className="text-[9px] text-muted mt-[2px]">{m.rotulo}</span>
              </span>
            </div>
          );
        })}
      </div>
      {meta && (
        <div className="flex flex-col gap-2">
          <span className="h-[6px] rounded-pill overflow-hidden" style={{ background: TRILHO }}>
            <span className="block h-full rounded-pill" style={{ width: `${Math.max(0, Math.min(1, meta.fracao)) * 100}%`, background: "var(--erp-graf-serie-1)" }} />
          </span>
          <span className="text-[11px] text-muted">{meta.texto}</span>
        </div>
      )}
    </div>
  );
}

/* ========================= "Relatório de transações" ========================= */
/**
 * Blocos proporcionais (um mosaico): o maior ocupa a metade da esquerda, os
 * outros dividem o resto. Cada bloco diz o nome e a fração.
 */
export function BlocosProporcao({ fatias, ariaLabel, altura = 200 }: { fatias: Fatia[]; ariaLabel: string; altura?: number }) {
  const fs = comCores([...fatias].sort((a, b) => b.valor - a.valor)).slice(0, 5);
  const [primeiro, ...resto] = fs;
  const TONS = ["var(--erp-graf-serie-1)", "var(--erp-graf-serie-5)", "var(--erp-graf-serie-3)", "color-mix(in srgb, var(--erp-graf-serie-1) 82%, var(--erp-graf-serie-3))", "var(--erp-graf-serie-4)"];
  const TEXTO = ["var(--color-white)", "var(--color-ink)", "var(--color-ink)", "var(--color-white)", "var(--color-white)"];
  const bloco = (f: (typeof fs)[number], i: number, style: React.CSSProperties) => (
    <div key={f.chave} title={`${f.nome} · ${pctTexto(f.fracao)}`} className="rounded-[14px] p-3 flex flex-col justify-between min-w-0 min-h-0"
      style={{ background: TONS[i], color: TEXTO[i], ...style }}>
      <span className="text-[11px] truncate opacity-80">{f.nome}</span>
      <span className="text-[18px] tabular-nums leading-none">{pctTexto(f.fracao)}</span>
    </div>
  );
  if (!primeiro) return null;
  return (
    <div role="img" aria-label={ariaLabel} className="grid gap-2" style={{ height: altura, gridTemplateColumns: "1.2fr 1fr", gridTemplateRows: "repeat(2, minmax(0, 1fr))" }}>
      {bloco(primeiro, 0, { gridRow: "1 / span " + (resto.length >= 3 ? 1 : 2) })}
      {resto.length >= 3 ? (
        <>
          {bloco(resto[0], 1, {})}
          <div className="grid gap-2 min-h-0" style={{ gridTemplateColumns: `repeat(${resto.length - 2}, minmax(0, 1fr))` }}>
            {resto.slice(1, resto.length - 1).map((f, k) => bloco(f, k + 2, {}))}
          </div>
          {bloco(resto[resto.length - 1], 4, {})}
        </>
      ) : (
        <div className="grid gap-2 min-h-0" style={{ gridTemplateRows: `repeat(${Math.max(1, resto.length)}, minmax(0, 1fr))` }}>
          {resto.map((f, k) => bloco(f, k + 1, {}))}
        </div>
      )}
    </div>
  );
}

/* ============================== "Estatística" ============================== */
/** Radar com duas séries (entradas e saídas) sobre os mesmos eixos. */
export function RadarSeries({ dados, ariaLabel, altura = 240, series, formatar }: {
  dados: Record<string, string | number>[]; ariaLabel: string; altura?: number;
  series?: { chave: string; nome: string; cor: string }[];
  /** Valor da dica (padrão: reais); notas de 0 a 100 passam o seu. */
  formatar?: (v: number) => React.ReactNode;
}) {
  const ss = series ?? [{ chave: "entrada", nome: "Entradas", cor: COR_ENTRADA }, { chave: "saida", nome: "Saídas", cor: COR_SAIDA }];
  return (
    <div role="img" aria-label={ariaLabel}>
      <LegendaPontos itens={ss} />
      <ResponsiveContainer width="100%" height={altura}>
        <RadarChart data={dados} outerRadius="72%">
          <PolarGrid stroke={GRADE} />
          <PolarAngleAxis dataKey="label" tick={EIXO} />
          <Tooltip content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as Record<string, number>;
            return <DicaGrafico rotulo={String(label ?? p.label)} linhas={ss.map((s) => { const v = Number(p[s.chave] ?? 0); return { cor: s.cor, nome: s.nome, valor: formatar ? formatar(v) : v }; })} />;
          }} />
          {ss.map((s, i) => (
            <Radar key={s.chave} dataKey={s.chave} name={s.nome} stroke={s.cor} fill={s.cor} fillOpacity={0.35} {...chartAnim(i * 120)} />
          ))}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ========================= "Estatística de saldo 2" ========================= */
/** Área em degradê com as SÉRIES escolhidas por abas (anos, contas, cenários). */
export function AreaPorAno({ series, ariaLabel, altura = 220, id, formatar }: {
  series: { chave: string; nome: string; dados: { label: string; valor: number }[] }[];
  ariaLabel: string; altura?: number; id: string; formatar?: (v: number) => React.ReactNode;
}) {
  const [ativa, setAtiva] = React.useState(0);
  const s = series[Math.min(ativa, series.length - 1)];
  const gid = `bib-es2-${id}`;
  if (!s) return null;
  return (
    <div role="img" aria-label={ariaLabel} className="flex flex-col gap-2">
      <div className="flex items-center gap-1 flex-wrap" role="tablist">
        {series.map((x, i) => (
          <button key={x.chave} type="button" role="tab" aria-selected={i === ativa} onClick={() => setAtiva(i)}
            className="h-[22px] px-[10px] rounded-pill text-[11px] tabular-nums"
            style={i === ativa ? { background: "var(--erp-graf-serie-1)", color: "var(--color-white)" } : { color: "var(--color-text-secondary)" }}>
            {x.nome}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={altura}>
        <ComposedChart data={s.dados} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          <defs><DegradeArea id={gid} /></defs>
          <CartesianGrid stroke={GRADE} vertical={false} />
          <XAxis dataKey="label" tick={EIXO} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tick={EIXO} tickLine={false} axisLine={false} width={64} tickFormatter={tickBRL} />
          <Tooltip cursor={{ stroke: "var(--erp-graf-comparacao)", strokeWidth: 1 }} content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const i = s.dados.findIndex((d) => d.label === label);
            const p = s.dados[i];
            if (!p) return null;
            return <DicaGrafico rotulo={`${label} · ${s.nome}`} valor={formatar ? formatar(p.valor) : p.valor}
              variacao={{ v: variacaoContra(p.valor, s.dados[i - 1]?.valor), frase: "sobre o anterior" }} />;
          }} />
          <Area type="linear" dataKey="valor" stroke="var(--erp-graf-serie-1)" strokeWidth={1} fill={`url(#${gid})`} {...chartAnim()} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ========================= "Dinheiro poupado 1" ========================= */
/** Dois números lado a lado e a barra que mostra quanto cada um pesa do total. */
export function DuasBarras({ a, b, ariaLabel }: {
  a: { nome: string; valor: number; cor?: string }; b: { nome: string; valor: number; cor?: string }; ariaLabel: string;
}) {
  const total = Math.abs(a.valor) + Math.abs(b.valor);
  const fa = total > 0 ? Math.abs(a.valor) / total : 0.5;
  const ca = a.cor ?? COR_ENTRADA, cb = b.cor ?? COR_SAIDA;
  return (
    <div role="img" aria-label={ariaLabel} className="flex flex-col gap-3">
      <div className="grid gap-3" style={{ gridTemplateColumns: `${Math.max(0.25, fa)}fr ${Math.max(0.25, 1 - fa)}fr` }}>
        {[{ x: a, c: ca }, { x: b, c: cb }].map(({ x, c }) => (
          <div key={x.nome} className="flex flex-col gap-1 pl-2 min-w-0" style={{ borderLeft: `1.5px solid ${c}` }}>
            <span className="text-[16px] text-ink tabular-nums truncate"><BRL value={x.valor} /></span>
            <span className="inline-flex items-center gap-[6px] text-[11px] text-muted">
              <span aria-hidden className="w-[14px] h-[5px] rounded-[3px]" style={{ background: c }} />{x.nome}
            </span>
          </div>
        ))}
      </div>
      <div className="flex h-[14px] rounded-[4px] overflow-hidden" aria-hidden>
        <span style={{ width: `${fa * 100}%`, background: ca }} />
        <span style={{ width: `${(1 - fa) * 100}%`, background: `repeating-linear-gradient(135deg, ${TRILHO} 0 4px, var(--color-white) 4px 8px)` }} />
      </div>
    </div>
  );
}

/* ========================= "Dinheiro poupado 2" ========================= */
/** Um círculo que se enche até a fração da meta, com o valor dentro. */
export function MetaCirculo({ atual, meta, ariaLabel, rotuloAtual = "Até agora", rotuloResto = "Falta", tamanho = 120 }: {
  atual: number; meta: number; ariaLabel: string; rotuloAtual?: string; rotuloResto?: string; tamanho?: number;
}) {
  const f = meta > 0 ? Math.max(0, Math.min(1, atual / meta)) : 0;
  const uid = React.useId().replace(/:/g, "");
  const r = tamanho / 2;
  const y = tamanho * (1 - f);
  return (
    <div role="img" aria-label={ariaLabel} className="flex flex-col gap-3">
      <div className="flex items-center gap-5 flex-wrap">
        <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} aria-hidden className="shrink-0">
          <defs><clipPath id={`mc-${uid}`}><circle cx={r} cy={r} r={r} /></clipPath></defs>
          <circle cx={r} cy={r} r={r} fill="var(--color-surface-2)" />
          <g clipPath={`url(#mc-${uid})`}>
            <path d={`M0 ${y} Q ${tamanho * 0.25} ${y - 8} ${r} ${y} T ${tamanho} ${y} V ${tamanho} H 0 Z`} fill="var(--erp-graf-serie-1)" />
          </g>
          <text x={r} y={r + 5} textAnchor="middle" fontSize={tx(13)} fill={f > 0.5 ? "var(--color-white)" : "var(--color-ink)"} className="tabular-nums">
            {Math.round(f * 100)}%
          </text>
        </svg>
        <LegendaPontos itens={[
          { cor: "var(--erp-graf-serie-1)", nome: rotuloAtual, detalhe: <BRL value={atual} /> },
          { cor: "var(--color-surface-3)", nome: rotuloResto, detalhe: <BRL value={Math.max(0, meta - atual)} /> },
        ]} />
      </div>
      <span className="flex justify-between text-[11px] text-muted"><span>Meta: <BRL value={meta} /></span><span>{Math.round(f * 100)}%</span></span>
    </div>
  );
}

/* ========================= "Média de despesas" ========================= */
/** Linhas com rótulo, "% · valor" à direita e a barra fina embaixo. */
export function ListaProgresso({ itens, ariaLabel }: {
  itens: { chave: string; nome: string; valor: number; fracao: number }[]; ariaLabel: string;
}) {
  return (
    <div role="img" aria-label={ariaLabel} className="flex flex-col gap-4">
      {itens.map((i) => (
        <div key={i.chave} className="flex flex-col gap-[6px]">
          <span className="flex justify-between gap-3 text-[12px]">
            <span className="text-ink truncate">{i.nome}</span>
            <span className="text-muted tabular-nums shrink-0">{pctTexto(i.fracao)} · <BRL value={i.valor} /></span>
          </span>
          <span className="h-[6px] rounded-pill overflow-hidden" style={{ background: TRILHO }}>
            <span className="block h-full rounded-pill" style={{ width: `${Math.max(0, Math.min(1, i.fracao)) * 100}%`, background: "var(--erp-graf-serie-1)" }} />
          </span>
        </div>
      ))}
    </div>
  );
}

/* ============================== "Saldo em conta" ============================== */
/** Linha reta com PONTOS em cada período, área em degradê e a base tracejada. */
export function LinhaPontos({ dados, ariaLabel, altura = 220, id, rotuloBase = "Comparação", formatar, eixo = tickBRL, dominio }: {
  dados: { label: string; valor: number; base?: number }[]; ariaLabel: string; altura?: number; id: string;
  rotuloBase?: string; formatar?: (v: number) => React.ReactNode;
  /** Rótulo do eixo Y (padrão: reais curtos); score e contagem passam o seu. */
  eixo?: (v: number) => string; dominio?: [number, number];
}) {
  const gid = `bib-sc-${id}`;
  const temBase = dados.some((d) => d.base != null);
  return (
    <div role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={altura}>
        <ComposedChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          <defs><DegradeArea id={gid} /></defs>
          <CartesianGrid stroke={GRADE} vertical={false} />
          <XAxis dataKey="label" tick={EIXO} tickLine={false} axisLine={false} minTickGap={20} />
          <YAxis tick={EIXO} tickLine={false} axisLine={false} width={eixo === tickBRL ? 64 : 36} tickFormatter={eixo} domain={dominio} />
          <Tooltip cursor={{ stroke: "var(--erp-graf-comparacao)", strokeWidth: 1 }} content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const i = dados.findIndex((d) => d.label === label);
            const p = dados[i];
            if (!p) return null;
            return <DicaGrafico rotulo={String(label)} valor={formatar ? formatar(p.valor) : p.valor}
              variacao={{ v: variacaoContra(p.valor, dados[i - 1]?.valor), frase: "sobre o anterior" }}
              linhas={temBase && p.base != null ? [{ cor: "var(--erp-graf-comparacao)", nome: rotuloBase, valor: p.base }] : undefined} />;
          }} />
          <Area type="linear" dataKey="valor" stroke="none" fill={`url(#${gid})`} {...chartAnim()} />
          {temBase && <Line type="monotone" dataKey="base" {...COMPARACAO} dot={false} {...chartAnim(80)} />}
          <Line type="linear" dataKey="valor" stroke="var(--erp-graf-serie-1)" strokeWidth={1}
            dot={{ r: 2.5, fill: "var(--color-white)", stroke: "var(--erp-graf-serie-1)", strokeWidth: 1 }}
            activeDot={{ r: 5, fill: "var(--erp-graf-serie-1)", stroke: "var(--color-white)", strokeWidth: 2 }} {...chartAnim()} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ============================== "Entradas × saídas" ============================== */
/** Barras agrupadas por período (entradas e saídas) com o período em destaque marcado. */
export function BarrasAgrupadas({ dados, ariaLabel, altura = 220, destaque, rotuloEntrada = "Entradas", rotuloSaida = "Saídas" }: {
  dados: PontoPar[]; ariaLabel: string; altura?: number; destaque?: number; rotuloEntrada?: string; rotuloSaida?: string;
}) {
  const alvo = destaque ?? dados.length - 1;
  const rotuloAlvo = dados[alvo]?.label;
  return (
    <div role="img" aria-label={ariaLabel}>
      <LegendaPontos itens={[{ cor: COR_ENTRADA, nome: rotuloEntrada }, { cor: COR_SAIDA, nome: rotuloSaida }]} />
      <ResponsiveContainer width="100%" height={altura}>
        <ComposedChart data={dados} barGap={2} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={GRADE} vertical={false} />
          {rotuloAlvo != null && <ReferenceArea x1={rotuloAlvo} x2={rotuloAlvo} fill="var(--erp-graf-serie-3)" fillOpacity={0.35} />}
          <XAxis dataKey="label" tick={EIXO} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={EIXO} tickLine={false} axisLine={false} width={64} tickFormatter={tickBRL} />
          <Tooltip cursor={CURSOR} content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const i = dados.findIndex((d) => d.label === label);
            const p = dados[i];
            if (!p) return null;
            const res = p.entrada - p.saida;
            const resAnt = dados[i - 1] ? dados[i - 1].entrada - dados[i - 1].saida : undefined;
            return <DicaGrafico rotulo={`${label} · resultado`} valor={res}
              variacao={{ v: variacaoContra(res, resAnt), frase: "sobre o anterior" }}
              linhas={[{ cor: COR_ENTRADA, nome: rotuloEntrada, valor: p.entrada }, { cor: COR_SAIDA, nome: rotuloSaida, valor: p.saida }]} />;
          }} />
          <Bar dataKey="entrada" name={rotuloEntrada} fill={COR_ENTRADA} radius={RAIO_TOPO} maxBarSize={14} {...chartAnim()} />
          <Bar dataKey="saida" name={rotuloSaida} fill={COR_SAIDA} radius={RAIO_TOPO} maxBarSize={14} {...chartAnim(120)} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ============================== "Velas" ============================== */
/**
 * Velas por período: corpo da abertura ao fechamento, pavio da mínima à máxima.
 * ⚠️ A cor é da SÉRIE: quem chama separa as velas de ALTA (`alta: true`) das de
 * BAIXA — a peça não compara números para pintar.
 */
export interface VelaPonto { label: string; abertura: number; fechamento: number; minima: number; maxima: number; alta: boolean }

export function Velas({ dados, ariaLabel, altura = 220, rotuloAlta = "Alta", rotuloBaixa = "Baixa" }: {
  dados: VelaPonto[]; ariaLabel: string; altura?: number; rotuloAlta?: string; rotuloBaixa?: string;
}) {
  const linhas = dados.map((d) => ({ ...d, faixa: [d.minima, d.maxima] as [number, number] }));
  const Forma = (props: { x?: number; y?: number; width?: number; height?: number; payload?: (typeof linhas)[number] }) => {
    const { x = 0, y = 0, width = 0, height = 0, payload } = props;
    if (!payload) return null;
    const { abertura, fechamento, minima, maxima, alta } = payload;
    const escala = maxima === minima ? 0 : height / (maxima - minima);
    const yDe = (v: number) => y + (maxima - v) * escala;
    const topo = yDe(Math.max(abertura, fechamento));
    const base = yDe(Math.min(abertura, fechamento));
    const cor = alta ? COR_ENTRADA : COR_SAIDA;
    const cx = x + width / 2;
    const w = Math.min(14, Math.max(6, width * 0.6));
    return (
      <g>
        <line x1={cx} x2={cx} y1={y} y2={y + height} stroke={cor} strokeWidth={1} />
        <rect x={cx - w / 2} y={topo} width={w} height={Math.max(2, base - topo)} rx={2} fill={cor} />
      </g>
    );
  };
  return (
    <div role="img" aria-label={ariaLabel}>
      <LegendaPontos itens={[{ cor: COR_ENTRADA, nome: rotuloAlta }, { cor: COR_SAIDA, nome: rotuloBaixa }]} />
      <ResponsiveContainer width="100%" height={altura}>
        <ComposedChart data={linhas} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={GRADE} vertical={false} />
          <XAxis dataKey="label" tick={EIXO} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={EIXO} tickLine={false} axisLine={false} width={64} tickFormatter={tickBRL} domain={["dataMin", "dataMax"]} />
          <Tooltip cursor={CURSOR} content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as VelaPonto;
            const linhasDica: LinhaDica[] = [
              { cor: "var(--color-text-secondary)", nome: "Abertura", valor: p.abertura },
              { cor: "var(--color-text-secondary)", nome: "Máxima", valor: p.maxima },
              { cor: "var(--color-text-secondary)", nome: "Mínima", valor: p.minima },
            ];
            return <DicaGrafico rotulo={`${label} · fechamento`} valor={p.fechamento}
              variacao={{ v: variacaoContra(p.fechamento, p.abertura), frase: "sobre a abertura" }} linhas={linhasDica} />;
          }} />
          <Bar dataKey="faixa" shape={<Forma />} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ============================== "Análise de preço 1" ============================== */
/** Colunas de fundo (o teto do período) com a linha do valor e pontos por cima. */
export function ColunasPreco({ dados, ariaLabel, altura = 220, formatar, rotulo = "valor" }: {
  dados: { label: string; valor: number }[]; ariaLabel: string; altura?: number;
  formatar?: (v: number) => React.ReactNode; rotulo?: string;
}) {
  const teto = Math.max(1, ...dados.map((d) => d.valor)) * 1.1;
  const linhas = dados.map((d) => ({ ...d, teto }));
  return (
    <div role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={altura}>
        <ComposedChart data={linhas} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={GRADE} vertical={false} />
          <XAxis dataKey="label" tick={EIXO} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={EIXO} tickLine={false} axisLine={false} width={64} tickFormatter={tickBRL} domain={[0, teto]} />
          <Tooltip cursor={false} content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const i = dados.findIndex((d) => d.label === label);
            const p = dados[i];
            if (!p) return null;
            return <DicaGrafico rotulo={`${label} · ${rotulo}`} valor={formatar ? formatar(p.valor) : p.valor}
              variacao={{ v: variacaoContra(p.valor, dados[i - 1]?.valor), frase: "sobre o anterior" }} />;
          }} />
          <Bar dataKey="teto" fill={TRILHO} radius={[6, 6, 6, 6]} maxBarSize={18} isAnimationActive={false} />
          <Line type="linear" dataKey="valor" stroke="var(--erp-graf-serie-3)" strokeWidth={1.5}
            dot={{ r: 2.5, fill: "var(--color-white)", stroke: "var(--erp-graf-serie-1)", strokeWidth: 1 }}
            activeDot={{ r: 5, fill: "var(--erp-graf-serie-1)", stroke: "var(--color-white)", strokeWidth: 2 }} {...chartAnim()} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
