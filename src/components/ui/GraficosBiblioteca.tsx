"use client";

import * as React from "react";
import {
  ResponsiveContainer, ComposedChart, Bar, Cell, Line, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import Link from "next/link";
import { DegradeArea, DicaGrafico, type LinhaDica } from "./Grafico";
import { Card } from "./Card";
import { InfoHint } from "./InfoHint";
import { chartAnim } from "@/lib/chart-anim";
import { RAIO_TOPO, RAIO_BASE, tickBRL } from "@/lib/grafico";

/**
 * Os modelos da prancheta "Biblioteca" do canvas "Quattro ERP · Gráficos e
 * tabelas" (15/10/2026) que o dono escolheu nas pranchetas de TROCAS. Cada
 * componente tem o nome do modelo no canvas, para que a próxima troca ache a
 * peça pelo nome que o dono vê:
 *
 *   · `BarrasEntradaSaida`  ← "Entradas" (barras para cima e para baixo)
 *   · `LinhaEntradaSaida`   ← "Análises 3" (linha reta, área, saídas tracejadas)
 *   · `BarrasDestaque`      ← "Receita 2" (barras, a atual em destaque)
 *   · `LinhasSuaves`        ← "Análises 2" (várias linhas curvas)
 *   · `AreaComparada`       ← "Estatística de saldo 1" (linha + área + base atrás)
 *   · `MapaCalorGrade`      ← "Atividade por horário" (grade monocromática)
 *   · `AneisConcentricos`   ← "Histórico de transferências 3" (anéis)
 *
 * ⚠️ As cores de ENTRADA e SAÍDA (`--erp-graf-entrada`/`--erp-graf-saida`)
 * são da SÉRIE, nunca do valor: o dono ligou "Positivo e negativo" nesses
 * modelos do canvas. Nenhuma cor aqui sai de comparar um número com zero — a
 * guarda `cor:` continua valendo (ver CLAUDE.md, terceira exceção declarada).
 */

/**
 * A moldura dos cards da Biblioteca (referência Jota): título 13px no cinza do
 * rótulo, sem ícone antes · o círculo com a seta que abre o destino · o valor
 * 22px na tinta · o subtítulo ABAIXO do valor, no cinza da meta. O "i" fica
 * ao lado do título, porque o canto direito é da seta.
 */
export function CartaoBiblioteca({
  titulo, href, info, valor, pesoValor = 500, subtitulo, extra, children, className,
}: {
  titulo: string;
  href?: string;
  info?: { oQue: string; comoCalcula?: string };
  valor?: React.ReactNode;
  pesoValor?: 500 | 600;
  subtitulo?: React.ReactNode;
  extra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={`flex flex-col gap-2 ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 min-w-0">
          <span className="text-[13px] font-medium truncate" style={{ color: "var(--color-text-secondary)" }}>{titulo}</span>
          {info && <InfoHint align="left" titulo={titulo} oQue={info.oQue} comoCalcula={info.comoCalcula} />}
        </span>
        {href && (
          <Link href={href} aria-label={`Abrir ${titulo}`}
            className="w-[22px] h-[22px] rounded-pill inline-flex items-center justify-center shrink-0 text-ink hover:opacity-80"
            style={{ background: "var(--color-surface-2)" }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: "block" }}>
              <path d="M3 7L7 3M3.6 3H7v3.4" />
            </svg>
          </Link>
        )}
      </div>
      {valor != null && (
        <span className="text-[22px] leading-none tabular-nums text-ink" style={{ fontWeight: pesoValor }}>{valor}</span>
      )}
      {subtitulo != null && <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>{subtitulo}</span>}
      {extra}
      <div className="mt-2">{children}</div>
    </Card>
  );
}

export const COR_ENTRADA = "var(--erp-graf-entrada)";
export const COR_SAIDA = "var(--erp-graf-saida)";
const EIXO = { fontSize: 11, fill: "var(--color-text-secondary)" };
const GRADE = "var(--erp-graf-grade)";
const CURSOR = { fill: "rgba(127,127,127,0.06)" };

type Formatar = (v: number) => React.ReactNode;

/** A variação de um ponto contra o anterior da MESMA série (fração; null = sem base). */
function variacaoContra(atual: number, anterior: number | undefined): number | null {
  if (anterior == null || anterior === 0) return null;
  return (atual - anterior) / Math.abs(anterior);
}

/* ============================== "Entradas" ============================== */
export interface PontoEntradaSaida { label: string; entrada: number; saida: number }

/**
 * Entradas para CIMA e saídas para BAIXO, no mesmo mês. As saídas chegam como
 * magnitude e são desenhadas negativas; a dica devolve os dois valores
 * positivos e a variação das entradas contra o mês anterior.
 */
export function BarrasEntradaSaida({
  dados, altura = 240, rotuloEntrada = "Entradas", rotuloSaida = "Saídas", ariaLabel,
}: {
  dados: PontoEntradaSaida[];
  altura?: number;
  rotuloEntrada?: string;
  rotuloSaida?: string;
  ariaLabel: string;
}) {
  const linhas = React.useMemo(() => dados.map((d) => ({ ...d, saidaNeg: -Math.abs(d.saida) })), [dados]);
  return (
    <div role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={altura}>
        <ComposedChart data={linhas} stackOffset="sign" margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={GRADE} vertical={false} />
          <XAxis dataKey="label" tick={EIXO} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={EIXO} tickLine={false} axisLine={false} width={64} tickFormatter={tickBRL} />
          <ReferenceLine y={0} stroke={GRADE} />
          <Tooltip
            cursor={CURSOR}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const i = linhas.findIndex((l) => l.label === label);
              const p = linhas[i];
              if (!p) return null;
              return (
                <DicaGrafico
                  rotulo={String(label)}
                  valor={p.entrada}
                  variacao={{ v: variacaoContra(p.entrada, linhas[i - 1]?.entrada), frase: "sobre o mês anterior" }}
                  linhas={[
                    { cor: COR_ENTRADA, nome: rotuloEntrada, valor: p.entrada },
                    { cor: COR_SAIDA, nome: rotuloSaida, valor: Math.abs(p.saida) },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="entrada" name={rotuloEntrada} stackId="s" fill={COR_ENTRADA} radius={RAIO_TOPO} maxBarSize={52} {...chartAnim()} />
          <Bar dataKey="saidaNeg" name={rotuloSaida} stackId="s" fill={COR_SAIDA} fillOpacity={0.55} radius={RAIO_BASE} maxBarSize={52} {...chartAnim(120)} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ============================= "Análises 3" ============================= */
/**
 * Entradas em linha RETA com a área em degradê por baixo, saídas tracejadas
 * por cima. A dica mostra a MARGEM do ponto: (entradas − saídas) ÷ entradas —
 * sem entradas, não há margem (e a dica diz isso, nunca "0%").
 */
export function LinhaEntradaSaida({
  dados, altura = 240, rotuloEntrada = "Entradas", rotuloSaida = "Saídas", ariaLabel, id,
}: {
  dados: PontoEntradaSaida[];
  altura?: number;
  rotuloEntrada?: string;
  rotuloSaida?: string;
  ariaLabel: string;
  id: string;
}) {
  const gid = `bib-a3-${id}`;
  return (
    <div role="img" aria-label={ariaLabel}>
      <Legenda itens={[{ cor: COR_ENTRADA, nome: rotuloEntrada }, { cor: COR_SAIDA, nome: rotuloSaida }]} />
      <ResponsiveContainer width="100%" height={altura}>
        <ComposedChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          <defs><DegradeArea id={gid} /></defs>
          <CartesianGrid stroke={GRADE} vertical={false} />
          <XAxis dataKey="label" tick={EIXO} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={EIXO} tickLine={false} axisLine={false} width={64} tickFormatter={tickBRL} />
          <Tooltip
            cursor={{ stroke: "var(--erp-graf-comparacao)", strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as PontoEntradaSaida;
              const margem = p.entrada > 0 ? (p.entrada - p.saida) / p.entrada : null;
              return (
                <DicaGrafico
                  rotulo={`${label} · margem`}
                  valor={margem == null ? "sem entradas" : <span className="tabular-nums">{Math.round(margem * 100)}%</span>}
                  linhas={[
                    { cor: COR_ENTRADA, nome: rotuloEntrada, valor: p.entrada },
                    { cor: COR_SAIDA, nome: rotuloSaida, valor: p.saida },
                  ]}
                />
              );
            }}
          />
          <Area type="linear" dataKey="entrada" stroke="none" fill={`url(#${gid})`} {...chartAnim()} />
          <Line type="linear" dataKey="entrada" name={rotuloEntrada} stroke={COR_ENTRADA} strokeWidth={1} dot={false}
            activeDot={{ r: 4, stroke: "var(--color-ink)", strokeWidth: 1, fill: "var(--color-white)" }} {...chartAnim()} />
          <Line type="linear" dataKey="saida" name={rotuloSaida} stroke={COR_SAIDA} strokeWidth={0.8} strokeDasharray="2 2" dot={false} {...chartAnim(120)} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ============================== "Receita 2" ============================== */
export interface PontoDestaque { label: string; valor: number; futuro?: boolean }

/**
 * Barras no cinza do texto, a barra em DESTAQUE na tinta e os pontos que ainda
 * não aconteceram (projeção) no cinza médio. Destaque padrão: o último ponto
 * realizado — o período corrente.
 */
export function BarrasDestaque({
  dados, altura = 240, destaque, formatar, ariaLabel, rotuloSerie = "Valor",
}: {
  dados: PontoDestaque[];
  altura?: number;
  destaque?: number;
  formatar?: Formatar;
  ariaLabel: string;
  rotuloSerie?: string;
}) {
  const realizados = dados.map((d, i) => (d.futuro ? -1 : i)).filter((i) => i >= 0);
  const alvo = destaque ?? realizados[realizados.length - 1] ?? -1;
  return (
    <div role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={altura}>
        <ComposedChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={GRADE} vertical={false} />
          <XAxis dataKey="label" tick={EIXO} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={EIXO} tickLine={false} axisLine={false} width={64} tickFormatter={tickBRL} />
          <Tooltip
            cursor={CURSOR}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const i = dados.findIndex((d) => d.label === label);
              const p = dados[i];
              if (!p) return null;
              return (
                <DicaGrafico
                  rotulo={p.futuro ? `${label} · previsto` : String(label)}
                  valor={formatar ? formatar(p.valor) : p.valor}
                  variacao={{ v: variacaoContra(p.valor, dados[i - 1]?.valor), frase: "sobre o anterior" }}
                />
              );
            }}
          />
          <Bar dataKey="valor" name={rotuloSerie} radius={RAIO_TOPO} maxBarSize={40} {...chartAnim()}>
            {dados.map((d, i) => (
              <Cell
                key={d.label + i}
                fill={i === alvo ? "var(--erp-graf-serie-1)" : d.futuro ? "var(--erp-graf-serie-5)" : "var(--erp-graf-serie-4)"}
              />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ============================== "Análises 2" ============================== */
export interface SerieSuave { chave: string; nome: string; cor: string; espessura?: number; tracejada?: boolean }

/** Várias séries em linha CURVA, finas, com a legenda em pontos acima. */
export function LinhasSuaves({
  dados, series, altura = 240, ariaLabel, xKey = "label", formatarX, zero = false,
}: {
  dados: Record<string, string | number>[];
  series: SerieSuave[];
  altura?: number;
  ariaLabel: string;
  xKey?: string;
  formatarX?: (v: string) => string;
  /** Desenha a linha do zero (gráfico de risco: a cor dela é sinal de alerta). */
  zero?: boolean;
}) {
  return (
    <div role="img" aria-label={ariaLabel}>
      <Legenda itens={series.map((s) => ({ cor: s.cor, nome: s.nome }))} />
      <ResponsiveContainer width="100%" height={altura}>
        <ComposedChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={GRADE} vertical={false} />
          <XAxis dataKey={xKey} tick={EIXO} tickLine={false} axisLine={false} minTickGap={28} tickFormatter={formatarX} />
          <YAxis tick={EIXO} tickLine={false} axisLine={false} width={64} tickFormatter={tickBRL} />
          {zero && <ReferenceLine y={0} stroke="var(--color-negative)" strokeDasharray="3 3" />}
          <Tooltip
            cursor={{ stroke: "var(--erp-graf-comparacao)", strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as Record<string, number>;
              const linhas: LinhaDica[] = series.map((s) => ({ cor: s.cor, nome: s.nome, valor: Number(p[s.chave] ?? 0) }));
              return <DicaGrafico rotulo={formatarX ? formatarX(String(label)) : String(label)} linhas={linhas} />;
            }}
          />
          {series.map((s, i) => (
            <Line
              key={s.chave} type="monotone" dataKey={s.chave} name={s.nome} stroke={s.cor}
              strokeWidth={s.espessura ?? 1} strokeDasharray={s.tracejada ? "2 2" : undefined}
              dot={false} activeDot={{ r: 3 }} {...chartAnim(i * 120)}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ========================= "Estatística de saldo 1" ========================= */
export interface PontoArea { label: string; valor: number; base?: number }

/**
 * A linha da série na tinta, curva, com a área em degradê lime por baixo e —
 * quando há — a BASE de comparação como uma área cinza atrás. A dica traz o
 * valor e a variação contra o ponto anterior.
 */
export function AreaComparada({
  dados, altura = 240, ariaLabel, id, rotuloBase = "Comparação", formatar, sufixoRotulo,
}: {
  dados: PontoArea[];
  altura?: number;
  ariaLabel: string;
  id: string;
  rotuloBase?: string;
  formatar?: Formatar;
  sufixoRotulo?: string;
}) {
  const gid = `bib-es1-${id}`;
  const temBase = dados.some((d) => d.base != null);
  return (
    <div role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={altura}>
        <ComposedChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          <defs><DegradeArea id={gid} /></defs>
          <CartesianGrid stroke={GRADE} vertical={false} />
          <XAxis dataKey="label" tick={EIXO} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={EIXO} tickLine={false} axisLine={false} width={64} tickFormatter={tickBRL} />
          <Tooltip
            cursor={{ stroke: "var(--erp-graf-serie-2)", strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const i = dados.findIndex((d) => d.label === label);
              const p = dados[i];
              if (!p) return null;
              return (
                <DicaGrafico
                  rotulo={sufixoRotulo ? `${label} · ${sufixoRotulo}` : String(label)}
                  valor={formatar ? formatar(p.valor) : p.valor}
                  variacao={{ v: variacaoContra(p.valor, dados[i - 1]?.valor), frase: "sobre o anterior" }}
                  linhas={temBase && p.base != null ? [{ cor: "var(--erp-graf-serie-5)", nome: rotuloBase, valor: p.base }] : undefined}
                />
              );
            }}
          />
          {temBase && <Area type="monotone" dataKey="base" stroke="none" fill="var(--erp-graf-serie-5)" fillOpacity={0.6} {...chartAnim()} />}
          <Area type="monotone" dataKey="valor" stroke="none" fill={`url(#${gid})`} {...chartAnim(80)} />
          <Line type="monotone" dataKey="valor" stroke="var(--erp-graf-serie-1)" strokeWidth={1} dot={false}
            activeDot={{ r: 5, fill: "var(--erp-graf-serie-1)", stroke: "var(--color-white)", strokeWidth: 2 }} {...chartAnim(80)} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ========================= "Atividade por horário" ========================= */
export interface CelulaCalor { chave: string; nivel: 0 | 1 | 2 | 3 | 4; titulo: string }

/** A rampa do mapa de calor: a tinta em cinco intensidades (do canvas). */
const RAMPA = [12, 26, 45, 68, 92].map((p) => `color-mix(in srgb, var(--color-ink) ${p}%, transparent)`);

/**
 * Grade monocromática: colunas são os dias da semana, linhas são as faixas
 * (semanas, horários). A intensidade da TINTA diz o nível; a legenda
 * "Menos · Mais" fecha a leitura. Célula vazia (fora do período) fica sem cor.
 */
export function MapaCalorGrade({
  colunas, linhas, celulas, legendaMenos = "Menos", legendaMais = "Mais", ariaLabel,
}: {
  colunas: string[];
  linhas: string[];
  /** `celulas[linha][coluna]` — `null` é fora do período. */
  celulas: (CelulaCalor | null)[][];
  legendaMenos?: string;
  legendaMais?: string;
  ariaLabel: string;
}) {
  return (
    <div role="img" aria-label={ariaLabel} className="flex flex-col gap-2">
      <div className="grid gap-[6px] items-center" style={{ gridTemplateColumns: `56px repeat(${colunas.length}, minmax(0, 1fr))` }}>
        <span />
        {colunas.map((c) => <span key={c} className="text-[11px] text-muted text-center">{c}</span>)}
        {linhas.map((l, i) => (
          <React.Fragment key={l}>
            <span className="text-[11px] text-muted tabular-nums">{l}</span>
            {colunas.map((c, j) => {
              const cel = celulas[i]?.[j] ?? null;
              return (
                <span
                  key={c}
                  title={cel?.titulo}
                  className="h-[22px] rounded-[6px]"
                  style={{ background: cel ? RAMPA[cel.nivel] : "transparent" }}
                />
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <div className="flex items-center justify-end gap-[6px] text-[11px] text-muted">
        <span>{legendaMenos}</span>
        {RAMPA.map((c) => <span key={c} className="w-[14px] h-[10px] rounded-[3px]" style={{ background: c }} />)}
        <span>{legendaMais}</span>
      </div>
    </div>
  );
}

/* ===================== "Histórico de transferências 3" ===================== */
export interface Anel { chave: string; nome: string; valor: number; fracao: number; cor: string; detalhe?: React.ReactNode }

/**
 * Um anel por item, do maior (fora) para o menor (dentro), cada um com a
 * fração do total desenhada sobre um trilho pontilhado. O centro mostra a
 * fração do maior. À esquerda: o total e a legenda.
 */
export function AneisConcentricos({
  aneis, total, rotuloTotal, ariaLabel, tamanho = 200,
}: {
  aneis: Anel[];
  total: React.ReactNode;
  rotuloTotal: string;
  ariaLabel: string;
  tamanho?: number;
}) {
  const visiveis = aneis.slice(0, 4);
  const c = tamanho / 2;
  const passo = 18;
  const maior = visiveis.reduce<Anel | null>((m, a) => (!m || a.fracao > m.fracao ? a : m), null);
  return (
    <div role="img" aria-label={ariaLabel} className="flex items-center justify-between gap-6 flex-wrap">
      <div className="flex flex-col gap-4 min-w-0">
        <div className="flex flex-col gap-1">
          <span className="text-[12px] text-muted">{rotuloTotal}</span>
          <span className="a4p-num text-[26px] leading-none text-ink tabular-nums">{total}</span>
        </div>
        <div className="flex flex-col gap-2">
          {visiveis.map((a) => (
            <span key={a.chave} className="inline-flex items-center gap-2 text-[13px] text-muted">
              <span aria-hidden className="w-[9px] h-[9px] rounded-[3px] shrink-0" style={{ background: a.cor }} />
              <span className="truncate">{a.nome}</span>
              {a.detalhe != null && <span className="text-ink tabular-nums">{a.detalhe}</span>}
            </span>
          ))}
        </div>
      </div>
      <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} aria-hidden className="shrink-0">
        {visiveis.map((a, i) => {
          const r = c - 4 - i * passo;
          if (r <= 8) return null;
          const volta = 2 * Math.PI * r;
          const f = Math.max(0, Math.min(1, a.fracao));
          return (
            <g key={a.chave} transform={`rotate(-90 ${c} ${c})`}>
              <circle cx={c} cy={c} r={r} fill="none" stroke="var(--erp-graf-grade)" strokeWidth={4} strokeDasharray="1.5 4" />
              <circle cx={c} cy={c} r={r} fill="none" stroke={a.cor} strokeWidth={5} strokeLinecap="round"
                strokeDasharray={`${volta * f} ${volta}`} />
            </g>
          );
        })}
        {maior && (
          <>
            <text x={c} y={c + 2} textAnchor="middle" fontSize={22} fill="var(--color-ink)" className="tabular-nums">
              {Math.round(maior.fracao * 100)}%
            </text>
            <text x={c} y={c + 18} textAnchor="middle" fontSize={10} fill="var(--color-text-secondary)">do total</text>
          </>
        )}
      </svg>
    </div>
  );
}

/** A legenda em pontos acima do gráfico (Análises 2 e 3). */
function Legenda({ itens }: { itens: { cor: string; nome: string }[] }) {
  return (
    <div className="flex items-center gap-4 flex-wrap mb-2">
      {itens.map((i) => (
        <span key={i.nome} className="inline-flex items-center gap-[6px] text-[12px] text-muted">
          <span aria-hidden className="w-[8px] h-[8px] rounded-[3px]" style={{ background: i.cor }} />
          {i.nome}
        </span>
      ))}
    </div>
  );
}

