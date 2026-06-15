"use client";

import * as React from "react";
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";
import { BRL, Card, Skeleton } from "@/components/ui";
import { formatBRL, formatBRLCompact } from "@/lib/format";
import type { DailyCashflowPoint } from "@/lib/types";
import { useDailyCashflow } from "./hooks";
import { usePeriod } from "./PeriodContext";
import { WidgetHeader, EmptyState, VisuallyHidden } from "./shared";

const POSITIVE = "var(--color-positive)";
const NEGATIVE = "var(--color-negative)";
const GRID = "var(--color-border-soft)";
const FAINT = "var(--color-text-tertiary)";

/** Vela do dia: abertura (saldo no início) → fechamento (saldo no fim); pavio do
 *  pico (saldo+entradas) ao fundo (saldo+saídas). Alta (verde) = dia gerou caixa. */
interface Candle { label: string; open: number; close: number; lowHigh: [number, number]; up: boolean; inflow: number; outflow: number }

function toCandles(data: DailyCashflowPoint[]): Candle[] {
  return data.map((d) => {
    const net = d.inflow + d.outflow; // outflow já é <= 0
    const close = d.balance;
    const open = close - net;
    const high = open + d.inflow;
    const low = open + d.outflow;
    return {
      label: d.label, open, close, up: close >= open,
      lowHigh: [Math.min(low, open, close), Math.max(high, open, close)],
      inflow: d.inflow, outflow: Math.abs(d.outflow),
    };
  });
}

/** Shape da vela: o Bar recebe value=[low,high] (barra flutuante) → daí derivo a
 *  escala em px e desenho pavio (linha central) + corpo (open↔close). */
function CandleShape(props: {
  x?: number; y?: number; width?: number; height?: number; payload?: Candle;
}) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  if (!payload) return null;
  const [low, high] = payload.lowHigh;
  const range = high - low || 1;
  const pxPerVal = height / range;
  const cx = x + width / 2;
  const openY = y + (high - payload.open) * pxPerVal;
  const closeY = y + (high - payload.close) * pxPerVal;
  const color = payload.up ? POSITIVE : NEGATIVE;
  const bodyTop = Math.min(openY, closeY);
  const bodyH = Math.max(2, Math.abs(closeY - openY));
  const bw = Math.max(4, Math.min(width * 0.6, 16));
  return (
    <g>
      <line x1={cx} x2={cx} y1={y} y2={y + height} stroke={color} strokeWidth={1.2} />
      <rect x={cx - bw / 2} y={bodyTop} width={bw} height={bodyH} fill={color} rx={1} />
    </g>
  );
}

function CandleTooltip({ active, payload, label }: { active?: boolean; payload?: { payload: Candle }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const c = payload[0].payload;
  return (
    <div className="bg-white rounded-card border border-border shadow-popover px-3 py-[10px] text-caption tabular-nums">
      <div className="font-medium text-ink mb-[6px]">{label}</div>
      <Row k="Abertura" v={<BRL value={c.open} />} />
      <Row k="Fechamento" v={<BRL value={c.close} />} color={c.up ? POSITIVE : NEGATIVE} />
      <Row k="Entradas" v={<BRL value={c.inflow} />} color={POSITIVE} />
      <Row k="Saídas" v={<BRL value={c.outflow} />} color={NEGATIVE} />
    </div>
  );
}
function Row({ k, v, color }: { k: string; v: React.ReactNode; color?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted">{k}</span>
      <span style={{ color: color ?? "var(--color-ink)" }}>{v}</span>
    </div>
  );
}

export function CashflowCandlestick() {
  const period = usePeriod();
  const { data, isLoading, isError } = useDailyCashflow(period.days);
  const legenda = period.preset === "hoje" ? "hoje" : `${period.label.toLowerCase()} · ${period.days} dias`;
  const hasFlow = !!data && data.some((d) => d.inflow !== 0 || d.outflow !== 0);
  const candles = React.useMemo(() => (data ? toCandles(data) : []), [data]);

  return (
    <Card className="flex flex-col">
      <WidgetHeader title="Velas do caixa" subtitle={`saldo dia a dia · ${legenda}`} />

      {isLoading && <Skeleton className="h-[260px] w-full" rounded="md" />}
      {isError && <EmptyState title="Não foi possível carregar as velas do caixa" />}
      {!isLoading && !isError && !hasFlow && (
        <EmptyState icon="trending-up" title="Sem movimentações no período" hint="Cada vela mostra a abertura e o fechamento do saldo no dia." />
      )}

      {!isLoading && !isError && hasFlow && (
        <figure className="m-0" role="img" aria-label={aria(candles, legenda)}>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={candles} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 13, fill: FAINT }} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 13, fill: FAINT }} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => formatBRLCompact(v)} />
              <ReferenceLine y={0} stroke="var(--color-border)" />
              <Tooltip content={<CandleTooltip />} cursor={{ fill: "rgba(127,127,127,0.10)" }} />
              <Bar dataKey="lowHigh" shape={<CandleShape />} isAnimationActive={false} maxBarSize={28} />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 text-caption text-muted">
            <span className="inline-flex items-center gap-[6px]"><span className="w-2 h-2 rounded-pill" style={{ background: POSITIVE }} />Dia gerou caixa</span>
            <span className="inline-flex items-center gap-[6px]"><span className="w-2 h-2 rounded-pill" style={{ background: NEGATIVE }} />Dia consumiu caixa</span>
          </div>
          <VisuallyHidden>{aria(candles, legenda)}</VisuallyHidden>
        </figure>
      )}
    </Card>
  );
}

function aria(c: Candle[], legenda: string): string {
  const first = c[0]?.open ?? 0;
  const last = c[c.length - 1]?.close ?? 0;
  const altas = c.filter((x) => x.up).length;
  return `Velas do caixa (${legenda}). Abertura ${formatBRL(first)}, fechamento ${formatBRL(last)}. ${altas} de ${c.length} dias geraram caixa.`;
}
