"use client";

import * as React from "react";
import {
  ComposedChart,
  Bar,
  Cell,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { BRL, Card, Skeleton } from "@/components/ui";
import { formatBRL, brlParts } from "@/lib/format";
import { isoDay } from "@/lib/aggregations";
import type { DailyCashflowPoint } from "@/lib/types";
import { useDailyCashflowRange } from "./hooks";
import { usePeriod } from "./PeriodContext";
import { EmptyState, VisuallyHidden } from "./shared";

const POSITIVE = "var(--color-positive)";
const NEGATIVE = "var(--color-negative)";
const INK = "var(--color-ink)";
// Linha de saldo: MESMO tratamento da linha de comparação do gráfico herói —
// cinza tracejado. Não compete com as barras, que são quem conta a história.
const LINE = "#c9cdd4";
const FAINT = "var(--color-text-tertiary)";
import { chartAnim } from "@/lib/chart-anim";

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
      {/* Valor do período (Laboratório): Roobert Variable 21/400, tracking
          −0.075em, entrelinha 115% — sempre em ink; o tipo é dado pelo dot. */}
      <span
        className="text-[21px] tabular-nums"
        style={{ fontFamily: '"Roobert Variable", "Roobert", sans-serif', fontWeight: 400, letterSpacing: "-0.02em", lineHeight: 1.15, color: "var(--color-ink)" }}
      >
        <span className="text-faint">R$ </span>{neg ? "−" : ""}{integer}
        <span data-cents="" style={{ fontSize: "0.7em" }}>,{decimals}</span>
      </span>
    </button>
  );
}

/**
 * Linha do tooltip, no `indicator="line"` da referência: o marcador é um
 * TRAÇO vertical, não um ponto.
 *
 * ⚠️ Num tooltip de três linhas o ponto redondo empata com o texto e vira
 * ruído; o traço acompanha a altura da linha e lê como a série que ele
 * representa — que é o motivo de a referência usar essa variante.
 */
function Row({ color, k, v }: { color: string; k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 tabular-nums">
      <span className="inline-flex items-center gap-[8px] text-muted">
        <span className="w-[3px] h-[12px] rounded-pill shrink-0" style={{ background: color }} />
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
        <div className="min-w-0">
          {/* subtítulo (período · projetado) ABAIXO do título. Os filtros de período
              vivem no topo da página (não duplicar aqui). */}
          <h2 className="m-0 text-h3 font-medium text-ink">{period.futuro ? "Fluxo de caixa projetado" : "Fluxo de caixa"}</h2>
          {/* O subtítulo do período saiu (Laboratório): o período já está no
              header da página, então repeti-lo aqui era ruído. */}
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
              {/* ⚠️ A GRADE SAIU. Na referência não há `CartesianGrid`: com o
                  eixo lateral já oculto, as linhas horizontais não ancoram
                  valor nenhum — eram régua sem números. O que localiza a
                  leitura é o tooltip. */}
              <XAxis
                dataKey="label"
                tick={{ fontSize: 13, fill: FAINT }}
                axisLine={false}
                tickMargin={10}
                tickLine={false}
                interval="preserveStartEnd"
              />
              {/* eixo lateral OCULTO (mantém a escala) — pedido do usuário */}
              <YAxis yAxisId="flow" hide />
              <YAxis yAxisId="balance" orientation="right" hide />
              <ReferenceLine yAxisId="flow" y={0} stroke="var(--color-border)" />
              {/* `cursor={false}`, como na referência: a faixa cinza atrás da
                  barra competia com o próprio destaque dela (`activeBar`) —
                  dois realces para o mesmo dia. */}
              <Tooltip content={<CashflowTooltip />} cursor={false} />
              {filtro !== "saida" && (
                <Bar yAxisId="flow" dataKey="inflow" stackId="cf" fill={POSITIVE} radius={[4, 4, 0, 0]} maxBarSize={26} name="Entradas" activeBar={{ fillOpacity: 0.8 }} {...chartAnim()}>
                  {data.map((d) => <Cell key={`i-${d.date}`} fillOpacity={d.projetado ? 0.4 : 1} />)}
                </Bar>
              )}
              {filtro !== "entrada" && (
                <Bar yAxisId="flow" dataKey="outflow" stackId="cf" fill={NEGATIVE} radius={[0, 0, 4, 4]} maxBarSize={26} name="Saídas" activeBar={{ fillOpacity: 0.8 }} {...chartAnim(120)}>
                  {data.map((d) => <Cell key={`o-${d.date}`} fillOpacity={d.projetado ? 0.4 : 1} />)}
                </Bar>
              )}
              {/* Saldo: linha cheia até hoje (realizado), tracejada à frente (projetado). Traço fino. */}
              {filtro === "todos" && <Line yAxisId="balance" type="monotone" dataKey={(d: DailyCashflowPoint) => (d.projetado ? null : d.balance)} stroke={LINE} strokeWidth={1.3} strokeDasharray="7 6" strokeLinecap="round" dot={false} connectNulls name="Saldo em caixa" />}
              {filtro === "todos" && <Line yAxisId="balance" type="monotone" dataKey={(d: DailyCashflowPoint) => (d.projetado || d.date === hojeISO ? d.balance : null)} stroke={LINE} strokeWidth={1.3} strokeDasharray="3 5" strokeLinecap="round" dot={false} connectNulls name="Saldo projetado" />}
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
        <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: LINE }} />
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
