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
  ResponsiveContainer, LineChart, Line, Area, XAxis, YAxis, Tooltip,
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
  const [tipoDist, setTipoDist] = React.useState<"entrada" | "saida">("saida");

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

    // distribuição por TIPO (entradas × saídas) do mês — categorias
    let entradas = 0, saidas = 0;
    const catE = new Map<string, number>();
    const catS = new Map<string, number>();
    for (const mv of inp.movements) {
      const ds = effDate(mv); if (!ds) continue;
      const d = new Date(ds + "T00:00:00");
      if (d.getFullYear() !== y || d.getMonth() !== m) continue;
      const v = Math.abs(mv.amount);
      const c = (mv.category || "Outros").trim() || "Outros";
      if (mv.type === "entrada") { entradas += v; catE.set(c, (catE.get(c) || 0) + v); }
      else { saidas += v; catS.set(c, (catS.get(c) || 0) + v); }
    }
    const buildSegs = (map: Map<string, number>) => {
      const arr = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
      const top = arr.slice(0, 6);
      const resto = arr.slice(6).reduce((s, [, v]) => s + v, 0);
      const segs = top.map(([n, v], i) => ({ name: n, value: v, color: DV[i % DV.length] }));
      if (resto > 0) segs.push({ name: "Outros", value: resto, color: PROJ });
      return segs;
    };

    return {
      serie, delta, gastoAteHoje, mes: m,
      entradas, saidas, resultado: entradas - saidas,
      segsEntrada: buildSegs(catE), segsSaida: buildSegs(catS),
    };
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
          <figure className="m-0" role="img" aria-label={`Ritmo de gasto: ${formatBRL(calc.gastoAteHoje)} no mês até hoje, ${formatBRL(Math.abs(calc.delta))} a ${gastouMenos ? "menos" : "mais"} que o mesmo período do mês anterior.`}>
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={calc.serie} margin={{ top: 10, right: 6, bottom: 0, left: 6 }}>
                <defs>
                  <linearGradient id="visorGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#28AA00" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#28AA00" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="dia" hide />
                <YAxis hide domain={[0, "dataMax"]} />
                <Tooltip content={<RitmoTooltip />} cursor={{ stroke: "#c9cdd4", strokeDasharray: "3 3" }} />
                <Area type="monotone" dataKey="atual" stroke="none" fill="url(#visorGlow)" isAnimationActive={false} connectNulls />
                <Line type="monotone" dataKey="anterior" stroke={COMPARE} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#bbbcbd", stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
                <Line type="monotone" dataKey="proj" stroke={PROJ} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} connectNulls />
                <Line type="monotone" dataKey="atual" stroke={POSITIVE} strokeWidth={2.4} dot={false} activeDot={{ r: 4, fill: POSITIVE, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} connectNulls />
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

      {/* DIREITA — Distribuição (toggle Entradas × Saídas) */}
      <Card className="flex flex-col">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[16px] font-semibold text-ink">Distribuição</span>
          {/* toggle: dois "box" dividindo entrada / saída */}
          <div className="flex p-1 gap-1 rounded-pill bg-surface-2" role="tablist" aria-label="Tipo de distribuição">
            {([["entrada", "Entradas"], ["saida", "Saídas"]] as const).map(([val, label]) => {
              const on = tipoDist === val;
              return (
                <button
                  key={val}
                  role="tab"
                  aria-selected={on}
                  onClick={() => setTipoDist(val)}
                  className={`text-caption font-medium rounded-pill px-4 py-[6px] transition-colors ${on ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {(() => {
          const segs = tipoDist === "entrada" ? calc.segsEntrada : calc.segsSaida;
          const total = tipoDist === "entrada" ? calc.entradas : calc.saidas;
          const ent = tipoDist === "entrada";
          return (
            <div className="flex flex-col sm:flex-row items-center gap-5 mt-4">
              {/* donut (tamanho fixo — evita distorção do ResponsiveContainer no flex) */}
              <div className="relative shrink-0" style={{ width: 188, height: 188 }}>
                <PieChart width={188} height={188}>
                  <Tooltip content={<DonutTooltip />} wrapperStyle={{ zIndex: 50, outline: "none" }} allowEscapeViewBox={{ x: true, y: true }} />
                  <Pie data={segs} dataKey="value" nameKey="name" cx={94} cy={94} innerRadius={60} outerRadius={88} paddingAngle={2} stroke="none" isAnimationActive={false}>
                    {segs.map((s, i) => <Cell key={i} fill={s.color} />)}
                  </Pie>
                </PieChart>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-4">
                  <span className="text-caption text-muted">{ent ? "Entradas" : "Saídas"} · {mesNome}</span>
                  <span className="text-[20px] font-semibold tabular-nums leading-none mt-1" style={{ color: ent ? "var(--color-positive)" : "var(--color-ink)" }}>
                    <BRL value={total} />
                  </span>
                </div>
              </div>

              {/* legenda */}
              <div className="flex-1 min-w-0 w-full flex flex-col">
                {segs.map((s, i) => {
                  const pct = total > 0 ? Math.round((s.value / total) * 1000) / 10 : 0;
                  return (
                    <div key={i} className={`flex items-center gap-3 py-[7px] ${i ? "border-t border-border-soft" : ""}`}>
                      <span className="w-[10px] h-[10px] rounded-sm shrink-0" style={{ background: s.color }} />
                      <span className="text-[15px] text-ink truncate flex-1">{s.name}</span>
                      <span className="text-[12px] text-muted bg-surface-2 rounded-pill px-2 py-[1px] shrink-0" style={{ fontVariantNumeric: "tabular-nums", letterSpacing: "0.4px", fontWeight: 500 }}>{pct}%</span>
                      <span className="text-[15px] text-ink shrink-0 w-[104px] text-right" style={{ fontVariantNumeric: "tabular-nums", letterSpacing: "0.6px", fontWeight: 500 }}>{formatBRL(s.value)}</span>
                      <Icon name={ent ? "trending-up" : "trending-down"} size={15} color={ent ? "var(--color-positive)" : "var(--color-negative)"} />
                    </div>
                  );
                })}
                {segs.length === 0 && <span className="text-caption text-faint">Sem {ent ? "entradas" : "saídas"} neste mês.</span>}
              </div>
            </div>
          );
        })()}
      </Card>
    </div>
  );
}

function DonutTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const color = p?.payload?.color as string;
  return (
    <div className="bg-white rounded-card border border-border px-4 py-3 text-caption" style={{ boxShadow: "0 6px 20px rgba(14,19,30,0.14)" }}>
      <div className="text-[15px] font-semibold text-ink mb-2">{p?.name}</div>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-pill" style={{ background: color }} />
        <span className="text-muted">Valor</span>
        <span className="text-ink ml-4" style={{ fontVariantNumeric: "tabular-nums", letterSpacing: "0.6px", fontWeight: 500 }}>{formatBRL(Number(p?.value) || 0)}</span>
      </div>
    </div>
  );
}

function RitmoTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload as { dia: number; anterior: number; atual: number | null; proj: number | null };
  const esteMes = p.atual ?? p.proj ?? 0;
  const projetado = p.atual == null;
  return (
    <div className="bg-white rounded-card border border-border px-4 py-3 text-caption" style={{ boxShadow: "0 6px 20px rgba(14,19,30,0.14)" }}>
      <div className="text-[15px] font-semibold text-ink mb-2">Dia {p.dia}</div>
      <TipRow color={POSITIVE} k={projetado ? "Este mês (proj.)" : "Este mês"} v={formatBRL(esteMes)} />
      <TipRow color="#bbbcbd" k="Mês passado" v={formatBRL(p.anterior ?? 0)} />
    </div>
  );
}
function TipRow({ color, k, v }: { color: string; k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-6 tabular-nums py-[2px]">
      <span className="inline-flex items-center gap-[6px] text-muted">
        <span className="w-2 h-2 rounded-pill" style={{ background: color }} />
        {k}
      </span>
      <span className="text-ink font-medium">{v}</span>
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
