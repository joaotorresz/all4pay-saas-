"use client";

import * as React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { BRL, Card, Skeleton } from "@/components/ui";
import { formatBRL, formatBRLCompact } from "@/lib/format";
import type { MonthlySalesPoint } from "@/lib/types";
import { useSalesChart } from "./hooks";
import { usePeriod } from "./PeriodContext";
import { WidgetHeader, EmptyState, VisuallyHidden } from "./shared";

const INK = "var(--color-ink)";
const GRID = "var(--color-border-soft)";
const FAINT = "var(--color-text-tertiary)";
const QUIET = "var(--color-border)";

function SalesTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value as number;
  return (
    <div className="bg-white rounded-card border border-border shadow-popover px-3 py-[10px] text-caption">
      <div className="font-medium text-ink mb-1">{label}</div>
      <div className="text-muted tabular-nums"><BRL value={v} /></div>
    </div>
  );
}

export function SalesChart() {
  const period = usePeriod();
  const { data, isLoading, isError } = useSalesChart(12);
  const hasSales = !!data && data.some((d) => d.total > 0);

  // Mantém 12 meses de contexto, mas DESTACA os meses dentro do período global.
  const fromM = period.from.slice(0, 7);
  const toM = period.to.slice(0, 7);
  const inPeriod = (month: string) => month >= fromM && month <= toM;
  const totalPeriodo = (data ?? []).filter((d) => inPeriod(d.month)).reduce((s, d) => s + d.total, 0);
  const subtitle = `${period.label.toLowerCase()} · ${formatBRL(totalPeriodo)}`;

  return (
    <Card className="flex flex-col">
      <WidgetHeader title="Vendas / Faturamento" subtitle={subtitle} />

      {isLoading && <Skeleton className="h-[260px] w-full" rounded="md" />}
      {isError && <EmptyState title="Não foi possível carregar as vendas" />}
      {!isLoading && !isError && !hasSales && (
        <EmptyState
          icon="trending-up"
          title="Sem vendas registradas"
          hint="Faturamento por mês aparece aqui conforme as vendas entram."
        />
      )}

      {!isLoading && !isError && hasSales && data && (
        <figure className="m-0" role="img" aria-label={salesAria(data, period.label, totalPeriodo)}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 13, fill: FAINT }}
                tickLine={false}
                axisLine={{ stroke: GRID }}
              />
              <YAxis
                tick={{ fontSize: 13, fill: FAINT }}
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={(v) => formatBRLCompact(v)}
              />
              <Tooltip
                content={<SalesTooltip />}
                cursor={{ fill: "rgba(23,23,23,0.04)" }}
              />
              <Bar dataKey="total" radius={[6, 6, 6, 6]} maxBarSize={24} name="Faturamento">
                {data.map((d, i) => (
                  <Cell key={i} fill={inPeriod(d.month) ? INK : QUIET} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <VisuallyHidden>{salesAria(data, period.label, totalPeriodo)}</VisuallyHidden>
        </figure>
      )}
    </Card>
  );
}

function salesAria(data: MonthlySalesPoint[], periodoLabel: string, totalPeriodo: number): string {
  const total12 = data.reduce((s, d) => s + d.total, 0);
  return `Faturamento dos últimos 12 meses, total ${formatBRL(total12)}. No período ${periodoLabel}: ${formatBRL(totalPeriodo)}.`;
}
