"use client";

/**
 * Topo da Home (DS Visor) — dois boxes na primeira linha, espelhando a
 * referência Visor Finance:
 *  • Esquerda "Saldo atual": saldo efetivo (hero) + gráfico de ritmo de gasto
 *    do mês (linha verde = mês atual · laranja = mês anterior · tracejado =
 *    projeção) com o balão "R$ x a menos este mês".
 *  • Direita "Entradas e saídas": donut da distribuição (entradas + categorias
 *    de saída) + legenda com %, valor e tendência.
 * Tudo derivado do mesmo RiskInput (demo/live idêntico). Flat (sem sombra/borda).
 */
import * as React from "react";
import {
  ResponsiveContainer, LineChart, Line, Area, XAxis, YAxis,
  PieChart, Pie, Cell,
} from "recharts";
import { Card, BRL, Icon, Skeleton } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import { useRiscoInput } from "./hooks";
import { MES_ABBR } from "./PeriodContext";

const POSITIVE = "var(--color-positive)";
const COMPARE = "var(--color-warning)"; // laranja (#F45900 no Visor)
const PROJ = "#c9cdd4";
/* paleta categórica do data-viz Visor */
const DV = ["#D9000A", "#4E649A", "#D70064", "#1A80AB", "#E9A100", "#8A8A8A"];

const effDate = (mv: { paid_date?: string | null; due_date: string }) => mv.paid_date || mv.due_date;

export function VisorHomeTop() {
  const { data: inp, isLoading } = useRiscoInput();

  const calc = React.useMemo(() => {
    if (!inp) return null;
    const hoje = new Date(inp.hoje + "T00:00:00");
    const y = hoje.getFullYear(), m = hoje.getMonth(), D = hoje.getDate();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const prevY = m === 0 ? y - 1 : y, prevM = m === 0 ? 11 : m - 1;
    const daysPrev = new Date(prevY, prevM + 1, 0).getDate();

    const cumul = (year: number, month: number) => {
      const perDay = new Array(32).fill(0);
      for (const mv of inp.movements) {
        if (mv.type !== "saida") continue;
        const ds = effDate(mv); if (!ds) continue;
        const d = new Date(ds + "T00:00:00");
        if (d.getFullYear() === year && d.getMonth() === month) perDay[d.getDate()] += Math.abs(mv.amount);
      }
      const out: number[] = []; let acc = 0;
      for (let i = 1; i <= 31; i++) { acc += perDay[i]; out[i] = acc; }
      return out;
    };
    const curC = cumul(y, m), prevC = cumul(prevY, prevM);
    const ritmoDia = curC[D] / Math.max(1, D);
    const serie: { dia: number; anterior: number; atual: number | null; proj: number | null }[] = [];
    for (let i = 1; i <= daysInMonth; i++) {
      serie.push({
        dia: i,
        anterior: i <= daysPrev ? prevC[i] : prevC[daysPrev],
        atual: i <= D ? curC[i] : null,
        proj: i >= D ? Math.round(ritmoDia * i) : null,
      });
    }
    const gastoAteHoje = curC[D];
    const anteriorAteHoje = prevC[Math.min(D, daysPrev)];
    const delta = anteriorAteHoje - gastoAteHoje; // >0 → gastou menos

    // distribuição entradas/saídas do mês
    let entradas = 0, saidas = 0;
    const catSaida = new Map<string, number>();
    for (const mv of inp.movements) {
      const ds = effDate(mv); if (!ds) continue;
      const d = new Date(ds + "T00:00:00");
      if (d.getFullYear() !== y || d.getMonth() !== m) continue;
      if (mv.type === "entrada") entradas += Math.abs(mv.amount);
      else { saidas += Math.abs(mv.amount); const c = (mv.category || "Outros").trim() || "Outros"; catSaida.set(c, (catSaida.get(c) || 0) + Math.abs(mv.amount)); }
    }
    const cats = Array.from(catSaida.entries()).sort((a, b) => b[1] - a[1]);
    const top = cats.slice(0, 5);
    const restoVal = cats.slice(5).reduce((s, [, v]) => s + v, 0);
    const segs: { name: string; value: number; color: string; tipo: "entrada" | "saida" }[] = [];
    if (entradas > 0) segs.push({ name: "Entradas", value: entradas, color: POSITIVE, tipo: "entrada" });
    top.forEach(([n, v], i) => segs.push({ name: n, value: v, color: DV[i % DV.length], tipo: "saida" }));
    if (restoVal > 0) segs.push({ name: "Outros", value: restoVal, color: PROJ, tipo: "saida" });
    const totalMov = entradas + saidas;

    return { serie, delta, gastoAteHoje, mes: m, entradas, saidas, resultado: entradas - saidas, segs, totalMov };
  }, [inp]);

  if (isLoading || !inp || !calc) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-5 mb-5">
        <Card><Skeleton className="h-[230px] w-full" rounded="md" /></Card>
        <Card><Skeleton className="h-[230px] w-full" rounded="md" /></Card>
      </div>
    );
  }

  const mesNome = MES_ABBR[calc.mes];
  const gastouMenos = calc.delta >= 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-5 mb-5">
      {/* ESQUERDA — Saldo atual + ritmo de gasto */}
      <Card className="flex flex-col">
        <span className="text-[16px] font-semibold text-ink">Saldo atual</span>
        <span className="text-[34px] font-semibold tabular-nums text-ink leading-none mt-2">
          <BRL value={inp.saldoAtual} />
        </span>
        <span className="text-caption text-muted mt-1">saldo efetivo consolidado das contas</span>

        <div className="relative mt-4">
          {/* balão verde (estilo Visor) */}
          <div className="absolute left-1/2 -translate-x-1/2 top-1 z-10">
            <span className="inline-flex items-center rounded-pill bg-positive text-white text-caption font-medium px-3 py-[5px] whitespace-nowrap shadow-sm">
              {formatBRL(Math.abs(calc.delta))} a {gastouMenos ? "menos" : "mais"} este mês
            </span>
          </div>
          <figure className="m-0" role="img" aria-label={`Ritmo de gasto: ${formatBRL(calc.gastoAteHoje)} no mês até hoje, ${formatBRL(Math.abs(calc.delta))} a ${gastouMenos ? "menos" : "mais"} que o mesmo período do mês anterior.`}>
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={calc.serie} margin={{ top: 28, right: 6, bottom: 0, left: 6 }}>
                <defs>
                  <linearGradient id="visorGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#28AA00" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#28AA00" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="dia" hide />
                <YAxis hide domain={[0, "dataMax"]} />
                <Area type="monotone" dataKey="atual" stroke="none" fill="url(#visorGlow)" isAnimationActive={false} connectNulls />
                <Line type="monotone" dataKey="anterior" stroke={COMPARE} strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="proj" stroke={PROJ} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} connectNulls />
                <Line type="monotone" dataKey="atual" stroke={POSITIVE} strokeWidth={2.4} dot={false} isAnimationActive={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </figure>
          <div className="flex items-center gap-4 text-caption text-muted flex-wrap mt-1">
            <Leg color={POSITIVE} label="Este mês" />
            <Leg color={COMPARE} label="Mês anterior" />
            <span className="inline-flex items-center gap-[6px]">
              <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: PROJ }} /> Projeção
            </span>
          </div>
        </div>
      </Card>

      {/* DIREITA — distribuição de entradas e saídas */}
      <Card className="flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <span className="text-[16px] font-semibold text-ink">Entradas e saídas · {mesNome}</span>
          <Icon name="arrow-up-right" size={16} color="var(--color-text-tertiary)" />
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-5 mt-3">
          {/* donut */}
          <div className="relative shrink-0" style={{ width: 188, height: 188 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={calc.segs} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={62} outerRadius={88} paddingAngle={2} stroke="none" isAnimationActive={false}>
                  {calc.segs.map((s, i) => <Cell key={i} fill={s.color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-caption text-muted">Resultado</span>
              <span className="text-[20px] font-semibold tabular-nums text-ink leading-none mt-1">
                <BRL value={calc.resultado} />
              </span>
            </div>
          </div>

          {/* legenda */}
          <div className="flex-1 min-w-0 w-full flex flex-col">
            {calc.segs.map((s, i) => {
              const pct = calc.totalMov > 0 ? Math.round((s.value / calc.totalMov) * 1000) / 10 : 0;
              return (
                <div key={i} className={`flex items-center gap-3 py-[7px] ${i ? "border-t border-border-soft" : ""}`}>
                  <span className="w-[10px] h-[10px] rounded-sm shrink-0" style={{ background: s.color }} />
                  <span className="text-[15px] text-ink truncate flex-1">{s.name}</span>
                  <span className="text-[12px] text-muted tabular-nums bg-surface-2 rounded-pill px-2 py-[1px] shrink-0">{pct}%</span>
                  <span className="text-[15px] tabular-nums text-ink shrink-0 w-[96px] text-right">{formatBRL(s.value)}</span>
                  <Icon name={s.tipo === "entrada" ? "trending-up" : "trending-down"} size={15} color={s.tipo === "entrada" ? "var(--color-positive)" : "var(--color-negative)"} />
                </div>
              );
            })}
            {calc.segs.length === 0 && <span className="text-caption text-faint">Sem movimentações neste mês.</span>}
          </div>
        </div>
      </Card>
    </div>
  );
}

function Leg({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-[6px]">
      <span className="inline-block w-4 border-t-2" style={{ borderColor: color }} /> {label}
    </span>
  );
}
