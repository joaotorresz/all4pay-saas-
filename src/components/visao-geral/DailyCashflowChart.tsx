"use client";

import * as React from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { Card, Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";
import { formatBRL, formatBRLCompact } from "@/lib/format";
import type { DailyCashflowPoint } from "@/lib/types";
import { useDailyCashflow } from "./hooks";
import { WidgetHeader, EmptyState, VisuallyHidden } from "./shared";

const POSITIVE = "#3F8F5B";
const NEGATIVE = "#C2473D";
const INK = "#171717";
const GRID = "#EFEFEF";
const FAINT = "#959595";

const PERIODS = [
  { days: 1, label: "No dia", legenda: "no dia" },
  { days: 7, label: "7 dias", legenda: "últimos 7 dias" },
  { days: 14, label: "14 dias", legenda: "últimos 14 dias" },
  { days: 30, label: "30 dias", legenda: "últimos 30 dias" },
  { days: 90, label: "3 meses", legenda: "últimos 3 meses" },
] as const;

function CashflowTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload as DailyCashflowPoint;
  return (
    <div className="bg-white rounded-card border border-border shadow-popover px-3 py-[10px] text-caption">
      <div className="font-medium text-ink mb-[6px]">{label}</div>
      <Row color={POSITIVE} k="Entradas" v={formatBRL(p.inflow)} />
      <Row color={NEGATIVE} k="Saídas" v={formatBRL(Math.abs(p.outflow))} />
      <Row color={INK} k="Saldo acum." v={formatBRL(p.balance)} />
    </div>
  );
}

function Row({ color, k, v }: { color: string; k: string; v: string }) {
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
  const [days, setDays] = React.useState<(typeof PERIODS)[number]["days"]>(14);
  const { data, isLoading, isError } = useDailyCashflow(days);
  const legenda = PERIODS.find((p) => p.days === days)?.legenda ?? `últimos ${days} dias`;

  const hasFlow =
    !!data && data.some((d) => d.inflow !== 0 || d.outflow !== 0);

  return (
    <Card className="h-full flex flex-col">
      <WidgetHeader
        title="Fluxo de caixa"
        subtitle={legenda}
        action={
          <div
            className="inline-flex items-center gap-1 bg-surface-2 rounded-md p-[2px]"
            role="group"
            aria-label="Selecionar período"
          >
            {PERIODS.map((p) => (
              <button
                key={p.days}
                onClick={() => setDays(p.days)}
                aria-pressed={days === p.days}
                className={cn(
                  "text-caption font-medium rounded-sm px-[10px] py-[4px] transition-colors whitespace-nowrap",
                  days === p.days
                    ? "bg-white text-ink shadow-pill"
                    : "text-muted hover:text-ink",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      />

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
              <ReferenceLine yAxisId="flow" y={0} stroke="#E9E9E9" />
              <Tooltip
                content={<CashflowTooltip />}
                cursor={{ fill: "rgba(23,23,23,0.04)" }}
              />
              <Bar
                yAxisId="flow"
                dataKey="inflow"
                stackId="cf"
                fill={POSITIVE}
                radius={[3, 3, 0, 0]}
                maxBarSize={22}
                name="Entradas"
              />
              <Bar
                yAxisId="flow"
                dataKey="outflow"
                stackId="cf"
                fill={NEGATIVE}
                radius={[0, 0, 3, 3]}
                maxBarSize={22}
                name="Saídas"
              />
              <Line
                yAxisId="balance"
                type="monotone"
                dataKey="balance"
                stroke={INK}
                strokeWidth={2}
                strokeDasharray="5 4"
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
          className="inline-block w-4 border-t-2 border-dashed"
          style={{ borderColor: INK }}
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
