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
import { Card, Skeleton } from "@/components/ui";
import { formatBRL, formatBRLCompact } from "@/lib/format";
import type { MonthlySalesPoint } from "@/lib/types";
import { useSalesChart } from "./hooks";
import { WidgetHeader, EmptyState, VisuallyHidden } from "./shared";

const INK = "#171717";
const GRID = "#EFEFEF";
const FAINT = "#959595";

function SalesTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value as number;
  return (
    <div className="bg-white rounded-card border border-border shadow-popover px-3 py-[10px] text-caption">
      <div className="font-medium text-ink mb-1">{label}</div>
      <div className="text-muted tabular-nums">{formatBRL(v)}</div>
    </div>
  );
}

export function SalesChart() {
  const { data, isLoading, isError } = useSalesChart(12);
  const hasSales = !!data && data.some((d) => d.total > 0);

  // Highlight the most recent month in ink; quiet the rest.
  const lastIdx = data ? data.length - 1 : -1;

  return (
    <Card className="h-full flex flex-col">
      <WidgetHeader title="Vendas / Faturamento" subtitle="últimos 12 meses" />

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
        <figure className="m-0 flex-1" role="img" aria-label={salesAria(data)}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: FAINT }}
                tickLine={false}
                axisLine={{ stroke: GRID }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: FAINT }}
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={(v) => formatBRLCompact(v)}
              />
              <Tooltip
                content={<SalesTooltip />}
                cursor={{ fill: "rgba(23,23,23,0.04)" }}
              />
              <Bar dataKey="total" radius={[3, 3, 0, 0]} maxBarSize={28} name="Faturamento">
                {data.map((_, i) => (
                  <Cell key={i} fill={i === lastIdx ? INK : "#D8D8D6"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <VisuallyHidden>{salesAria(data)}</VisuallyHidden>
        </figure>
      )}
    </Card>
  );
}

function salesAria(data: MonthlySalesPoint[]): string {
  const total = data.reduce((s, d) => s + d.total, 0);
  const last = data[data.length - 1];
  return `Faturamento dos últimos 12 meses, total ${formatBRL(total)}. Mês mais recente (${
    last?.label
  }): ${formatBRL(last?.total ?? 0)}.`;
}
