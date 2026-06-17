"use client";

import * as React from "react";
import {
  ComposedChart,
  Bar,
  Cell,
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
import { formatBRL, formatBRLCompact, brlParts } from "@/lib/format";
import { isoDay } from "@/lib/aggregations";
import type { DailyCashflowPoint } from "@/lib/types";
import { useDailyCashflowRange } from "./hooks";
import { usePeriod, MES_ABBR } from "./PeriodContext";
import { EmptyState, VisuallyHidden } from "./shared";

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
      <Row color={LINE} k="Saldo" v={<BRL value={p.balance} />} />
    </div>
  );
}

function PeriodTotal({ label, value, color }: { label: string; value: number; color: string }) {
  const neg = value < 0;
  const { integer, decimals } = brlParts(value);
  return (
    <div className="flex flex-col">
      <span className="text-[12px] text-faint">{label}</span>
      {/* R$ no MESMO tamanho dos números · decimais ~30% menores · Onest herdada */}
      <span className="text-[20px] font-medium tabular-nums" style={{ color }}>
        <span className="text-faint">R$ </span>{neg ? "−" : ""}{integer}
        <span style={{ fontSize: "0.7em" }}>,{decimals}</span>
      </span>
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
  const { data, isLoading, isError } = useDailyCashflowRange(period.from, period.to);
  const temProjecao = (data ?? []).some((d) => d.projetado && (d.inflow !== 0 || d.outflow !== 0));
  const legenda = period.label + (temProjecao ? " · projetado" : "");

  // "Essa semana": domingo → sábado da semana do dia atual.
  const essaSemana = () => {
    const h = new Date(); h.setHours(0, 0, 0, 0);
    const dom = new Date(h); dom.setDate(h.getDate() - h.getDay()); // 0 = domingo
    const sab = new Date(dom); sab.setDate(dom.getDate() + 6);
    period.setRange(isoDay(dom), isoDay(sab));
  };
  // "Esse mês": volta ao mês atual e vigente (sai de qualquer range).
  const esseMes = () => { const n = new Date(); period.setMonth(n.getFullYear(), n.getMonth()); };

  const hojeISO = isoDay(new Date());
  const hojeLabel = (data ?? []).find((d) => d.date === hojeISO)?.label;
  // Início de mês DENTRO do intervalo (exceto o 1º ponto) → linha vertical.
  const mesInicios = (data ?? []).filter((d, i) => i > 0 && d.date.slice(8, 10) === "01");

  const hasFlow =
    !!data && data.some((d) => d.inflow !== 0 || d.outflow !== 0);

  // Totais do período (Receitas/Despesas/Resultado) — números, não só o gráfico.
  const entradas = (data ?? []).reduce((s, d) => s + d.inflow, 0);
  const saidas = (data ?? []).reduce((s, d) => s + Math.abs(d.outflow), 0);
  const resultado = entradas - saidas;

  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          {/* subtítulo (período · projetado) ABAIXO do título */}
          <h2 className="m-0 text-h3 font-medium text-ink truncate">Fluxo de caixa</h2>
          <span className="text-caption text-faint">{legenda}</span>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <button
            onClick={essaSemana}
            className="inline-flex items-center rounded-[18px] bg-ink text-lime px-4 h-9 text-[16px] font-semibold"
          >
            Essa semana
          </button>
          <button
            onClick={esseMes}
            className="inline-flex items-center rounded-[18px] bg-surface-1 text-ink px-4 h-9 text-[16px] font-semibold"
          >
            Esse mês
          </button>
        </div>
      </div>

      {!isLoading && !isError && hasFlow && (
        <div className="flex items-center gap-12 -mt-1 mb-1 flex-wrap">
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
        <figure className="m-0" role="img" aria-label={cashflowAria(data, legenda)}>
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
                tick={{ fontSize: 13, fill: FAINT }}
                tickLine={false}
                axisLine={{ stroke: GRID }}
                interval="preserveStartEnd"
              />
              <YAxis
                yAxisId="flow"
                tick={{ fontSize: 13, fill: FAINT }}
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
                name="Saldo em caixa"
              />
              <Tooltip
                content={<CashflowTooltip />}
                cursor={{ fill: "rgba(127,127,127,0.10)" }}
              />
              <Bar yAxisId="flow" dataKey="inflow" stackId="cf" fill={POSITIVE} radius={[3, 3, 0, 0]} maxBarSize={56} name="Entradas" isAnimationActive={false}>
                {data.map((d) => <Cell key={`i-${d.date}`} fillOpacity={d.projetado ? 0.4 : 1} />)}
              </Bar>
              <Bar yAxisId="flow" dataKey="outflow" stackId="cf" fill={NEGATIVE} radius={[0, 0, 3, 3]} maxBarSize={56} name="Saídas" isAnimationActive={false}>
                {data.map((d) => <Cell key={`o-${d.date}`} fillOpacity={d.projetado ? 0.4 : 1} />)}
              </Bar>
              {/* Saldo: linha cheia até hoje (realizado), tracejada à frente (projetado). */}
              <Line yAxisId="balance" type="monotone" dataKey={(d: DailyCashflowPoint) => (d.projetado ? null : d.balance)} stroke={LINE} strokeWidth={1.4} dot={false} connectNulls name="Saldo em caixa" />
              <Line yAxisId="balance" type="monotone" dataKey={(d: DailyCashflowPoint) => (d.projetado || d.date === hojeISO ? d.balance : null)} stroke={LINE} strokeWidth={1.4} strokeDasharray="4 3" dot={false} connectNulls name="Saldo projetado" />
              {/* Linhas verticais: início de mês (faint tracejado) e dia atual (ink). */}
              {mesInicios.map((d) => (
                <ReferenceLine
                  key={`m-${d.date}`}
                  yAxisId="flow"
                  x={d.label}
                  stroke="var(--color-border)"
                  strokeDasharray="3 3"
                  label={{ value: MES_ABBR[Number(d.date.slice(5, 7)) - 1], position: "insideTopLeft", fontSize: 11, fill: FAINT }}
                />
              ))}
              {hojeLabel && (
                <ReferenceLine
                  yAxisId="flow"
                  x={hojeLabel}
                  stroke="var(--color-ink)"
                  strokeWidth={1.2}
                  label={{ value: "hoje", position: "insideTopRight", fontSize: 11, fill: "var(--color-ink)" }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
          <Legend projetado={temProjecao} />
          <VisuallyHidden>{cashflowAria(data, legenda)}</VisuallyHidden>
        </figure>
      )}
    </Card>
  );
}

function Legend({ projetado }: { projetado?: boolean }) {
  return (
    <div className="flex items-center gap-4 mt-2 text-[15px] text-muted flex-wrap">
      <LegendDot color={POSITIVE} label="Entradas" />
      <LegendDot color={NEGATIVE} label="Saídas" />
      <span className="inline-flex items-center gap-[6px]">
        <span className="inline-block w-4 border-t-2" style={{ borderColor: LINE }} />
        Saldo em caixa
      </span>
      {projetado && (
        <span className="inline-flex items-center gap-[6px]">
          <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: LINE }} />
          Projetado (a partir de hoje)
        </span>
      )}
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
  )}, saídas ${formatBRL(outflow)}, saldo em caixa ${formatBRL(last)}.`;
}
