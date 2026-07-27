"use client";

import * as React from "react";
import { DailyCashflowLW, type ModoGrafico } from "./DailyCashflowLW";
import { Card, Skeleton } from "@/components/ui";
import { formatBRL, brlParts } from "@/lib/format";
import { isoDay } from "@/lib/aggregations";
import type { DailyCashflowPoint } from "@/lib/types";
import { useDailyCashflowRange } from "./hooks";
import { usePeriod } from "./PeriodContext";
import { EmptyState, VisuallyHidden } from "./shared";

// Cores usadas pela legenda e pelos totais do rodapé (o gráfico em si lê os
// tokens direto, em `DailyCashflowLW`).
const POSITIVE = "var(--color-positive)";
const NEGATIVE = "var(--color-negative)";
const INK = "var(--color-ink)";
const LINE = "var(--color-chart-line)"; // linha de saldo acumulado — verde da marca

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

export function DailyCashflowChart() {
  const period = usePeriod();
  const { data, isLoading, isError } = useDailyCashflowRange(period.from, period.to);
  const temProjecao = (data ?? []).some((d) => d.projetado && (d.inflow !== 0 || d.outflow !== 0));
  const legenda = period.label + (temProjecao ? " · projetado" : "");

  const hojeISO = isoDay(new Date());
  // Filtro por tipo (botões Entradas/Saídas abaixo do gráfico).
  const [filtro, setFiltro] = React.useState<"todos" | "entrada" | "saida">("todos");
  // Barras (entradas/saídas + saldo) × Velas (candlestick do saldo).
  const [modo, setModo] = React.useState<ModoGrafico>("barras");

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
      comoCalcula: "Barras = entradas (verde) e saídas (vermelho) liquidadas por dia; a linha é o saldo acumulado partindo do saldo atual. Em Velas, cada candle é o SALDO do dia: abre no saldo de ontem e fecha no de hoje (corpo verde se subiu, vermelho se caiu); os pavios marcam a máxima e a mínima que o caixa alcançaria conforme a ordem dos lançamentos — máxima = abertura + entradas, mínima = abertura + saídas.",
    }}>
      <div className="mb-3 flex items-center gap-3">
        <div className="min-w-0">
          {/* subtítulo (período · projetado) ABAIXO do título. Os filtros de período
              vivem no topo da página (não duplicar aqui). */}
          <h2 className="m-0 text-h3 font-medium text-ink">{period.futuro ? "Fluxo de caixa projetado" : "Fluxo de caixa"}</h2>
          <span className="text-caption text-faint">{legenda}</span>
        </div>
        {/* Barras × Velas (candlestick do saldo) */}
        <div className="ml-auto inline-flex rounded-md bg-surface-2 p-[3px] shrink-0">
          {(["barras", "velas"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModo(m)}
              aria-pressed={modo === m}
              title={m === "velas" ? "Candlestick do saldo em caixa" : "Entradas, saídas e saldo"}
              className={`px-[10px] py-[5px] text-[12px] font-medium rounded-sm transition-colors ${
                modo === m ? "bg-white text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {m === "barras" ? "Barras" : "Velas"}
            </button>
          ))}
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
          {/* PILOTO: este gráfico roda em TradingView Lightweight Charts (canvas,
              crosshair, zoom/pan). Os demais seguem em Recharts — a lib não faz
              radar nem eixo categórico. Reverter = voltar o <ComposedChart>. */}
          <DailyCashflowLW data={data} filtro={filtro} hojeISO={hojeISO} altura={260} modo={modo} />
          <Legend projetado={temProjecao} modo={modo} />
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

function Legend({ projetado, modo }: { projetado?: boolean; modo: ModoGrafico }) {
  if (modo === "velas") {
    // A vela do caixa não é óbvia: dizemos o que corpo e pavio significam.
    return (
      <div className="flex items-center gap-4 mt-2 text-[15px] text-muted flex-wrap">
        <LegendDot color={POSITIVE} label="Fechou acima" />
        <LegendDot color={NEGATIVE} label="Fechou abaixo" />
        <span className="text-[13px] text-faint">
          Corpo = saldo da abertura ao fechamento · pavio = faixa que o caixa percorreu no dia
          {projetado ? " · velas claras são previstas" : ""}
        </span>
      </div>
    );
  }
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
