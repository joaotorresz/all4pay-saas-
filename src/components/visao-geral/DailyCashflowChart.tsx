"use client";

import * as React from "react";
import {
  ComposedChart,
  Bar,
  Cell,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { BRL, Card, Skeleton } from "@/components/ui";
import { Icon3D } from "@/components/ui/Icon3D";
import { formatBRL, brlParts } from "@/lib/format";
import { isoDay } from "@/lib/aggregations";
import type { DailyCashflowPoint } from "@/lib/types";
import { useDailyCashflowRange } from "./hooks";
import { usePeriod } from "./PeriodContext";
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

function PeriodTotal({ label, value, color, active, onClick }: { label: string; value: number; color: string; active?: boolean; onClick?: () => void }) {
  const neg = value < 0;
  const { integer, decimals } = brlParts(value);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-col items-start text-left rounded-md px-3 py-2 transition-colors ${active ? "bg-surface-2" : "hover:bg-surface-1"}`}
    >
      <span className="text-[12px] text-faint inline-flex items-center gap-[5px]">
        <span className="w-[7px] h-[7px] rounded-pill" style={{ background: color }} />{label}
      </span>
      {/* Número em NEGRITO, sempre preto (ink); o tipo é dado pelo dot do rótulo. */}
      <span className="text-[20px] font-bold tabular-nums text-ink">
        <span className="text-faint font-medium">R$ </span>{neg ? "−" : ""}{integer}
        <span style={{ fontSize: "0.7em" }}>,{decimals}</span>
      </span>
    </button>
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

  const hojeISO = isoDay(new Date());
  // Filtro por tipo (botões Entradas/Saídas abaixo do gráfico).
  const [filtro, setFiltro] = React.useState<"todos" | "entrada" | "saida">("todos");

  const hasFlow =
    !!data && data.some((d) => d.inflow !== 0 || d.outflow !== 0);

  // Totais do período (Receitas/Despesas/Resultado) — números, não só o gráfico.
  const entradas = (data ?? []).reduce((s, d) => s + d.inflow, 0);
  const saidas = (data ?? []).reduce((s, d) => s + Math.abs(d.outflow), 0);
  const resultado = entradas - saidas;

  return (
    <Card className="flex flex-col" info={{
      titulo: "Fluxo de caixa",
      oQue: "Quanto entra e sai do caixa por dia, com o saldo acumulado ao longo do período.",
      comoCalcula: "Barras = entradas (verde) e saídas (vermelho) liquidadas por dia; a linha é o saldo acumulado partindo do saldo atual.",
    }}>
      <div className="mb-3 flex items-center gap-3">
        <Icon3D name="bank" size={40} />
        <div>
          {/* subtítulo (período · projetado) ABAIXO do título. Os filtros de período
              vivem no topo da página (não duplicar aqui). */}
          <h2 className="m-0 text-h3 font-medium text-ink">{period.futuro ? "Fluxo de caixa projetado" : "Fluxo de caixa"}</h2>
          <span className="text-caption text-faint">{legenda}</span>
        </div>
      </div>

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
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 13, fill: FAINT }}
                tickLine={false}
                axisLine={{ stroke: GRID }}
                interval="preserveStartEnd"
              />
              {/* eixo lateral OCULTO (mantém a escala) — pedido do usuário */}
              <YAxis yAxisId="flow" hide />
              <YAxis yAxisId="balance" orientation="right" hide />
              <ReferenceLine yAxisId="flow" y={0} stroke="var(--color-border)" />
              <Tooltip
                content={<CashflowTooltip />}
                cursor={{ fill: "rgba(127,127,127,0.10)" }}
              />
              {filtro !== "saida" && (
                <Bar yAxisId="flow" dataKey="inflow" stackId="cf" fill={POSITIVE} radius={[6, 6, 6, 6]} maxBarSize={26} name="Entradas" isAnimationActive={false}>
                  {data.map((d) => <Cell key={`i-${d.date}`} fillOpacity={d.projetado ? 0.4 : 1} />)}
                </Bar>
              )}
              {filtro !== "entrada" && (
                <Bar yAxisId="flow" dataKey="outflow" stackId="cf" fill={NEGATIVE} radius={[6, 6, 6, 6]} maxBarSize={26} name="Saídas" isAnimationActive={false}>
                  {data.map((d) => <Cell key={`o-${d.date}`} fillOpacity={d.projetado ? 0.4 : 1} />)}
                </Bar>
              )}
              {/* Saldo: linha cheia até hoje (realizado), tracejada à frente (projetado). Traço fino. */}
              {filtro === "todos" && <Line yAxisId="balance" type="monotone" dataKey={(d: DailyCashflowPoint) => (d.projetado ? null : d.balance)} stroke={LINE} strokeWidth={1.2} dot={false} connectNulls name="Saldo em caixa" />}
              {filtro === "todos" && <Line yAxisId="balance" type="monotone" dataKey={(d: DailyCashflowPoint) => (d.projetado || d.date === hojeISO ? d.balance : null)} stroke={LINE} strokeWidth={1.2} strokeDasharray="4 3" dot={false} connectNulls name="Saldo projetado" />}
            </ComposedChart>
          </ResponsiveContainer>
          <Legend projetado={temProjecao} />
          <VisuallyHidden>{cashflowAria(data, legenda)}</VisuallyHidden>
        </figure>
      )}

      {/* Totais do período — ABAIXO do gráfico. Entradas/Saídas são BOTÕES que
          filtram o gráfico (clique de novo p/ voltar); Resultado mostra tudo. */}
      {!isLoading && !isError && hasFlow && (
        <div className="flex items-center gap-x-3 gap-y-2 mt-4 pt-4 border-t border-border-soft flex-wrap">
          <PeriodTotal label="Entradas" value={entradas} color={POSITIVE} active={filtro === "entrada"} onClick={() => setFiltro((f) => (f === "entrada" ? "todos" : "entrada"))} />
          <PeriodTotal label="Saídas" value={saidas} color={NEGATIVE} active={filtro === "saida"} onClick={() => setFiltro((f) => (f === "saida" ? "todos" : "saida"))} />
          <PeriodTotal label="Resultado" value={resultado} color={resultado < 0 ? NEGATIVE : INK} active={filtro === "todos"} onClick={() => setFiltro("todos")} />
        </div>
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
