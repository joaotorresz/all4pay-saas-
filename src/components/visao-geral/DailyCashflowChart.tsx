"use client";

import * as React from "react";
import {
  ComposedChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { BRL, Card, Skeleton } from "@/components/ui";
import { formatBRL, formatBRLCompact } from "@/lib/format";
import type { DailyCashflowPoint } from "@/lib/types";
import { useDailyCashflow } from "./hooks";
import { usePeriod } from "./PeriodContext";
import { WidgetHeader, EmptyState, VisuallyHidden } from "./shared";

const POSITIVE = "var(--color-positive)";
const NEGATIVE = "var(--color-negative)";
const INK = "var(--color-ink)";
const LINE = "var(--color-chart-line)"; // linha de saldo acumulado — verde da marca
const GRID = "var(--color-border-soft)";
const FAINT = "var(--color-text-tertiary)";

function CashflowTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload as DailyCashflowPoint;
  return (
    <div className="bg-white rounded-card border border-border shadow-popover px-3 py-[10px] text-caption">
      <div className="font-medium text-ink mb-[6px]">{label}</div>
      <Row color={POSITIVE} k="Entradas" v={<BRL value={p.inflow} />} />
      <Row color={NEGATIVE} k="Saídas" v={<BRL value={Math.abs(p.outflow)} />} />
      <Row color={LINE} k="Saldo acum." v={<BRL value={p.balance} />} />
    </div>
  );
}

function PeriodTotal({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-caption text-faint">{label}</span>
      <span className="text-[15px] font-medium tabular-nums" style={{ color }}><BRL value={value} /></span>
    </div>
  );
}

function Row({ color, k, v }: { color: string; k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 tabular-nums">
      <span className="inline-flex items-center gap-[6px] text-muted">
        <span className="w-2 h-2 rounded-pill" style={{ background: color }} />
        {k}
      </span>
      <span className="text-ink">{v}</span>
    </div>
  );
}

export function DailyCashflowChart() {
  const period = usePeriod();
  const days = period.days;
  const { data, isLoading, isError } = useDailyCashflow(days);
  const legenda = period.preset === "hoje" ? "hoje" : `${period.label.toLowerCase()} · ${days} dias`;

  const hasFlow =
    !!data && data.some((d) => d.inflow !== 0 || d.outflow !== 0);

  // Totais do período (Receitas/Despesas/Resultado) — números, não só o gráfico.
  const entradas = (data ?? []).reduce((s, d) => s + d.inflow, 0);
  const saidas = (data ?? []).reduce((s, d) => s + Math.abs(d.outflow), 0);
  const resultado = entradas - saidas;

  return (
    <Card className="h-full flex flex-col">
      <WidgetHeader
        title="Fluxo de caixa"
        subtitle={legenda}
      />

      {!isLoading && !isError && hasFlow && (
        <div className="flex items-center gap-5 -mt-1 mb-1 flex-wrap">
          <PeriodTotal label="Entradas" value={entradas} color={POSITIVE} />
          <PeriodTotal label="Saídas" value={saidas} color={NEGATIVE} />
          <PeriodTotal label="Resultado" value={resultado} color={resultado < 0 ? NEGATIVE : INK} />
        </div>
      )}

      {isLoading && <Skeleton className="h-[260px] w-full" rounded="md" />}
      {isError && (
        <EmptyState title="Não foi possível carregar o fluxo de caixa" />
      )}
      {!isLoading && !isError && !hasFlow && (
        <EmptyState
          icon="trending-up"
          title="Sem movimentações no período"
          hint="Movimentações liquidadas aparecem aqui dia a dia."
        />
      )}

      {!isLoading && !isError && hasFlow && data && (
        <figure className="m-0 flex-1" role="img" aria-label={cashflowAria(data, legenda)}>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart
              data={data}
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              stackOffset="sign"
            >
              <defs>
                {/* Glow em gradiente sob a linha de saldo — igual à referência */}
                <linearGradient id="cashGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#dcff00" stopOpacity={0.22} />
                  <stop offset="70%" stopColor="#dcff00" stopOpacity={0.06} />
                  <stop offset="100%" stopColor="#dcff00" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: FAINT }}
                tickLine={false}
                axisLine={{ stroke: GRID }}
                interval="preserveStartEnd"
              />
              <YAxis
                yAxisId="flow"
                tick={{ fontSize: 11, fill: FAINT }}
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={(v) => formatBRLCompact(v)}
              />
              <YAxis yAxisId="balance" orientation="right" hide />
              <ReferenceLine yAxisId="flow" y={0} stroke="var(--color-border)" />
              {/* Glow ao FUNDO (antes das barras) — não tinge os candles */}
              <Area
                yAxisId="balance"
                type="monotone"
                dataKey="balance"
                stroke="none"
                fill="url(#cashGlow)"
                isAnimationActive={false}
                name="Saldo acumulado"
              />
              <Tooltip
                content={<CashflowTooltip />}
                cursor={{ fill: "rgba(127,127,127,0.10)" }}
              />
              <Bar
                yAxisId="flow"
                dataKey="inflow"
                stackId="cf"
                fill={POSITIVE}
                radius={[3, 3, 0, 0]}
                maxBarSize={56}
                name="Entradas"
              />
              <Bar
                yAxisId="flow"
                dataKey="outflow"
                stackId="cf"
                fill={NEGATIVE}
                radius={[0, 0, 3, 3]}
                maxBarSize={56}
                name="Saídas"
              />
              <Line
                yAxisId="balance"
                type="monotone"
                dataKey="balance"
                stroke={LINE}
                strokeWidth={1.4}
                dot={false}
                name="Saldo acumulado"
              />
            </ComposedChart>
          </ResponsiveContainer>
          <Legend />
          <VisuallyHidden>{cashflowAria(data, legenda)}</VisuallyHidden>
        </figure>
      )}
    </Card>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-4 mt-2 text-caption text-muted">
      <LegendDot color={POSITIVE} label="Entradas" />
      <LegendDot color={NEGATIVE} label="Saídas" />
      <span className="inline-flex items-center gap-[6px]">
        <span
          className="inline-block w-4 border-t-2"
          style={{ borderColor: LINE }}
        />
        Saldo acumulado
      </span>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-[6px]">
      <span className="w-2 h-2 rounded-pill" style={{ background: color }} />
      {label}
    </span>
  );
}

function cashflowAria(data: DailyCashflowPoint[], legenda: string): string {
  const inflow = data.reduce((s, d) => s + d.inflow, 0);
  const outflow = data.reduce((s, d) => s + Math.abs(d.outflow), 0);
  const last = data[data.length - 1]?.balance ?? 0;
  return `Fluxo de caixa (${legenda}). Entradas ${formatBRL(
    inflow,
  )}, saídas ${formatBRL(outflow)}, saldo acumulado ${formatBRL(last)}.`;
}
