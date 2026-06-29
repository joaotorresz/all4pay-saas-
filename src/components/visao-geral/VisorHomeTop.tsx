"use client";

/**
 * Topo da Home (DS Visor) — espelha a referência Visor Finance, na identidade
 * all4pay (monocromático + lime; nada do azul do Visor):
 *  • ESQUERDA: card-herói "Saldo atual" com a evolução do saldo no período —
 *    linha VERDE = realizado (até hoje) · TRACEJADA = projeção (de hoje em
 *    diante) · linha LARANJA (warning) = mesmo intervalo do PERÍODO ANTERIOR
 *    (comparação). No fim da linha, um BALÃO de callout (estilo Visor) com a
 *    diferença vs. o período anterior. Abaixo, o card "Dica" (ink + lime).
 *  • DIREITA: "Distribuição dos gastos" — donut por categoria (toggle Entradas/
 *    Saídas) com o total no centro + legenda.
 * Tudo derivado do mesmo RiskInput (demo/live idêntico). Flat (sem sombra/borda).
 */
import * as React from "react";
import {
  ResponsiveContainer, LineChart, Line, Area, XAxis, YAxis, Tooltip, ReferenceLine, LabelList,
} from "recharts";
import { Card, Skeleton, Icon } from "@/components/ui";
import { formatBRL, formatBRLCompact } from "@/lib/format";
import { useRiscoInput } from "./hooks";
import { usePeriod, MES_ABBR } from "./PeriodContext";
import { AnimatedBRL } from "./useCountUp";

const POSITIVE = "var(--color-positive)";
const NEGATIVE = "var(--color-negative)";
const ORANGE = "var(--color-warning)";
const PROJ = "#c9cdd4";
/* paleta categórica do data-viz — cores vibrantes e distintas */
const DV = ["#FF3B30", "#2F6BFF", "#FF2D8E", "#00B8D4", "#FFB300", "#8B5CF6", "#10B981", "#F97316"];
const brlNoCents = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");

const effDate = (mv: { paid_date?: string | null; due_date: string }) => mv.paid_date || mv.due_date;

type Ponto = { idx: number; label: string; saldo: number | null; proj: number | null; prev: number | null; tip: number | null };

export function VisorHomeTop() {
  const { data: inp, isLoading } = useRiscoInput();
  const period = usePeriod();
  const [tipoDist, setTipoDist] = React.useState<"entrada" | "saida">("saida");

  const calc = React.useMemo(() => {
    if (!inp) return null;
    const DAY = 86400000;
    const pad = (n: number) => String(n).padStart(2, "0");
    const parse = (s: string) => new Date(s + "T00:00:00");
    const isoAt = (base: Date, i: number) => { const d = new Date(base.getTime() + i * DAY); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
    const fromD = parse(period.from);
    const toD = parse(period.to);
    const hojeD = parse(inp.hoje);
    const nDays = Math.max(1, Math.round((toD.getTime() - fromD.getTime()) / DAY) + 1);
    const prevFromD = new Date(fromD.getTime() - nDays * DAY); // mesmo intervalo, imediatamente antes

    // === EVOLUÇÃO DO SALDO ===
    // Fluxo líquido por dia (entrada +, saída −) de TODOS os movimentos.
    const netByDay = new Map<string, number>();
    for (const mv of inp.movements) {
      const ds = effDate(mv); if (!ds) continue;
      const net = mv.type === "entrada" ? Math.abs(mv.amount) : -Math.abs(mv.amount);
      netByDay.set(ds, (netByDay.get(ds) || 0) + net);
    }
    // Prefix-sum do fluxo na janela união [min(from,hoje,prevFrom) .. max(to,hoje)].
    const minD = new Date(Math.min(fromD.getTime(), hojeD.getTime(), prevFromD.getTime()));
    const maxD = new Date(Math.max(toD.getTime(), hojeD.getTime()));
    const totalDays = Math.round((maxD.getTime() - minD.getTime()) / DAY) + 1;
    const pref: number[] = new Array(totalDays);
    for (let i = 0; i < totalDays; i++) pref[i] = (i ? pref[i - 1] : 0) + (netByDay.get(isoAt(minD, i)) || 0);
    const idxOf = (d: Date) => Math.round((d.getTime() - minD.getTime()) / DAY);
    const Ptoday = pref[idxOf(hojeD)] ?? 0;
    // saldo(d) ancorado: saldo(hoje) = saldoAtual; deriva pelo fluxo acumulado.
    const saldoEm = (d: Date) => inp.saldoAtual + ((pref[idxOf(d)] ?? Ptoday) - Ptoday);

    const Didx = Math.round((hojeD.getTime() - fromD.getTime()) / DAY); // índice de "hoje" no período
    const fmtDia = (d: Date) => `${pad(d.getDate())}/${MES_ABBR[d.getMonth()]}`;
    const serie: Ponto[] = [];
    let temNeg = false;
    for (let i = 0; i < nDays; i++) {
      const d = new Date(fromD.getTime() + i * DAY);
      const bal = Math.round(saldoEm(d) * 100) / 100;
      const prevBal = Math.round(saldoEm(new Date(prevFromD.getTime() + i * DAY)) * 100) / 100;
      if (bal < 0) temNeg = true;
      const realizado = i <= Didx; // até hoje (inclusive)
      const projetado = i >= Didx; // de hoje em diante
      serie.push({ idx: i, label: fmtDia(d), saldo: realizado ? bal : null, proj: projetado ? bal : null, prev: prevBal, tip: null });
    }
    const saldoInicial = saldoEm(fromD);
    const saldoFinal = saldoEm(toD);
    const variacao = saldoFinal - saldoInicial;
    const temProj = Didx < nDays - 1; // há trecho futuro dentro do período
    // comparação vs. período anterior (fim contra fim) — narrativa do balão
    const prevFinal = saldoEm(new Date(prevFromD.getTime() + (nDays - 1) * DAY));
    const deltaVsPrev = saldoFinal - prevFinal;
    serie[serie.length - 1].tip = saldoFinal; // âncora do balão no fim da linha

    // distribuição por TIPO (entradas × saídas) DENTRO do período selecionado
    let entradas = 0, saidas = 0;
    const catE = new Map<string, number>();
    const catS = new Map<string, number>();
    for (const mv of inp.movements) {
      const ds = effDate(mv); if (!ds) continue;
      const t = parse(ds).getTime();
      if (t < fromD.getTime() || t > toD.getTime()) continue;
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
      serie, saldoInicial, saldoFinal, variacao, temNeg, temProj, deltaVsPrev,
      entradas, saidas, resultado: entradas - saidas,
      segsEntrada: buildSegs(catE), segsSaida: buildSegs(catS),
    };
  }, [inp, period.from, period.to]);

  if (isLoading || !inp || !calc) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5 mb-5">
        <Card><Skeleton className="h-[320px] w-full" rounded="md" /></Card>
        <Card><Skeleton className="h-[320px] w-full" rounded="md" /></Card>
      </div>
    );
  }

  const bom = calc.deltaVsPrev >= 0; // mais saldo que o período anterior = bom
  const bubbleText = `${bom ? "▲" : "▼"} ${formatBRLCompact(Math.abs(calc.deltaVsPrev))} vs. anterior`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5 mb-5 items-start">
      {/* ESQUERDA — herói (saldo + evolução com comparação) + Dica */}
      <div className="flex flex-col gap-5">
        <Card className="flex flex-col">
          <span className="text-[16px] font-semibold text-ink">{period.futuro ? "Saldo projetado" : "Saldo atual"}</span>
          <span className="text-[34px] font-semibold tabular-nums text-ink leading-none mt-2">
            <AnimatedBRL value={period.futuro ? calc.saldoFinal : inp.saldoAtual} />
          </span>
          <span className="text-caption text-muted mt-1">{period.futuro ? "saldo projetado ao fim do período" : "saldo efetivo consolidado das contas"}</span>

          <div className="relative mt-4">
            <figure className="m-0" role="img" aria-label={`Evolução do saldo no período (${period.label}): de ${formatBRL(calc.saldoInicial)} a ${formatBRL(calc.saldoFinal)}. ${bom ? "Acima" : "Abaixo"} do período anterior em ${formatBRL(Math.abs(calc.deltaVsPrev))}.`}>
              <ResponsiveContainer width="100%" height={188}>
                <LineChart data={calc.serie} margin={{ top: 28, right: 8, bottom: 0, left: 8 }}>
                  <defs>
                    <linearGradient id="visorGlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#28AA00" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="#28AA00" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" hide />
                  <YAxis hide domain={["auto", "auto"]} />
                  {calc.temNeg && <ReferenceLine y={0} stroke="var(--color-border)" />}
                  <Tooltip content={<SaldoTooltip />} cursor={{ stroke: "#c9cdd4", strokeDasharray: "3 3" }} />
                  <Area type="monotone" dataKey="saldo" stroke="none" fill="url(#visorGlow)" isAnimationActive={false} connectNulls />
                  {/* período anterior — laranja (comparação) */}
                  <Line type="monotone" dataKey="prev" stroke={ORANGE} strokeWidth={1.8} dot={false} isAnimationActive={false} connectNulls />
                  {/* projeção (de hoje em diante) — tracejada cinza */}
                  <Line type="monotone" dataKey="proj" stroke={PROJ} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} connectNulls />
                  {/* saldo realizado (até hoje) — verde */}
                  <Line type="monotone" dataKey="saldo" stroke={POSITIVE} strokeWidth={2.4} dot={false} activeDot={{ r: 4, fill: POSITIVE, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} connectNulls />
                  {/* linha invisível só para ancorar o BALÃO no fim da série */}
                  <Line dataKey="tip" stroke="transparent" dot={false} isAnimationActive={false} legendType="none">
                    <LabelList dataKey="tip" content={<Callout text={bubbleText} good={bom} />} />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </figure>
            <div className="flex items-center gap-4 text-caption text-muted flex-wrap mt-1">
              <Leg color={POSITIVE} label="Saldo realizado" />
              <Leg color={ORANGE} label="Período anterior" />
              {calc.temProj && (
                <span className="inline-flex items-center gap-[6px]">
                  <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: PROJ }} /> Projeção
                </span>
              )}
            </div>
          </div>
        </Card>

        <DicaCard />
      </div>

      {/* DIREITA — Distribuição (toggle Entradas × Saídas) */}
      <Card className="flex flex-col">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[16px] font-semibold text-ink">{tipoDist === "saida" ? "Distribuição dos gastos" : "Distribuição das entradas"}</span>
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
            <div className="flex flex-col items-center gap-5 mt-4">
              {/* donut SVG próprio (determinístico) — nunca distorce/desvincula */}
              <DonutChart segs={segs} total={total} centerLabel={ent ? "Total recebido" : "Gasto total"} />

              {/* legenda — nome à esquerda · % e valor alinhados à direita */}
              <div className="w-full flex flex-col">
                {segs.map((s, i) => {
                  const pct = total > 0 ? Math.round((s.value / total) * 1000) / 10 : 0;
                  return (
                    <div key={i} className={`flex items-center gap-3 py-2 ${i ? "border-t border-border-soft" : ""}`}>
                      <span className="w-[10px] h-[10px] rounded-sm shrink-0" style={{ background: s.color }} />
                      <span className="text-[15px] text-ink truncate flex-1">{s.name}</span>
                      <span className="text-[12px] text-muted bg-surface-2 rounded-pill px-2 py-[1px] shrink-0 text-right" style={{ fontVariantNumeric: "tabular-nums", letterSpacing: "0.3px", fontWeight: 500, minWidth: 46 }}>
                        {pct.toLocaleString("pt-BR")}%
                      </span>
                      <span className="text-[15px] text-ink shrink-0 text-right whitespace-nowrap" style={{ fontVariantNumeric: "tabular-nums", letterSpacing: "0.4px", fontWeight: 500, minWidth: 100 }}>{formatBRL(s.value)}</span>
                    </div>
                  );
                })}
                {segs.length === 0 && <span className="text-caption text-faint">Sem {ent ? "entradas" : "saídas"} no período.</span>}
              </div>
            </div>
          );
        })()}
      </Card>
    </div>
  );
}

/**
 * Balão de callout no fim da linha (estilo Visor). Renderizado dentro do SVG do
 * Recharts via <LabelList content>. Fica à ESQUERDA do ponto final, com um rabo
 * triangular apontando para o ponto. Verde (bom) ou vermelho (ruim) — pequeno
 * sinal semântico, fill mínimo (dentro do DS). `x/y/value` vêm do Recharts.
 */
function Callout(props: any) {
  const { x, y, value, text, good } = props;
  if (value == null || typeof x !== "number" || typeof y !== "number") return null;
  const bg = good ? POSITIVE : NEGATIVE;
  const bh = 26;
  const bw = Math.max(120, text.length * 6.6 + 22);
  const bx = Math.max(2, x - bw - 8); // à esquerda do ponto
  const by = Math.min(Math.max(2, y - bh / 2), 188 - bh - 2);
  const midY = by + bh / 2;
  return (
    <g style={{ pointerEvents: "none" }}>
      <rect x={bx} y={by} width={bw} height={bh} rx={8} fill={bg} />
      {/* rabo: aponta da borda direita do balão para o ponto (x,y) */}
      <polygon points={`${bx + bw},${midY - 5} ${bx + bw},${midY + 5} ${x},${y}`} fill={bg} />
      <text x={bx + bw / 2} y={midY} fill="#fff" fontSize={12} fontWeight={600} textAnchor="middle" dominantBaseline="central" style={{ fontVariantNumeric: "tabular-nums" }}>
        {text}
      </text>
      {/* ponto final */}
      <circle cx={x} cy={y} r={4} fill={good ? POSITIVE : NEGATIVE} stroke="#fff" strokeWidth={2} />
    </g>
  );
}

/**
 * Card "Dica" (equivalente ao "Dica do Visor", na identidade all4pay: ink +
 * lime, nunca o azul do Visor). Carrossel de dicas financeiras com bolinhas e
 * setas prev/next. Estático (dicas curadas), demo-safe.
 */
const DICAS = [
  "Defina um limite mensal de gastos para ver projeções do seu saldo nos próximos meses.",
  "Conecte um extrato (OFX/CSV) em Upload para classificar seus lançamentos automaticamente.",
  "Cadastre seus contratos em Recorrências para projetar a receita contratada (MRR) no fluxo.",
  "Acompanhe a aba Inteligência para o score de saúde financeira e o runway do caixa.",
];
function DicaCard() {
  const [i, setI] = React.useState(0);
  const go = (d: number) => setI((p) => (p + d + DICAS.length) % DICAS.length);
  return (
    <Card className="bg-ink text-white flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-md inline-flex items-center justify-center" style={{ background: "var(--color-lime)" }}>
          <Icon name="sparkles" size={16} color="var(--color-on-lime)" />
        </span>
        <span className="text-[15px] font-semibold">Dica all4pay</span>
      </div>
      <p className="m-0 text-[15px] leading-snug text-white/85 min-h-[44px]">{DICAS[i]}</p>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-[6px] flex-1">
          {DICAS.map((_, k) => (
            <span key={k} className="h-[6px] rounded-pill transition-all" style={{ width: k === i ? 20 : 6, background: k === i ? "var(--color-lime)" : "rgba(255,255,255,0.3)" }} />
          ))}
        </div>
        <button onClick={() => go(-1)} aria-label="Dica anterior" className="w-8 h-8 rounded-pill inline-flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors">
          <Icon name="chevron-left" size={16} color="#fff" />
        </button>
        <button onClick={() => go(1)} aria-label="Próxima dica" className="w-8 h-8 rounded-pill inline-flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors">
          <Icon name="chevron-right" size={16} color="#fff" />
        </button>
      </div>
    </Card>
  );
}

/**
 * Donut SVG próprio (sem Recharts) — determinístico: viewBox fixo, anéis via
 * stroke-dasharray com pontas retas (butt). Não depende de medição de layout,
 * então NUNCA distorce/“desvincula”. Hover destaca o anel e mostra a categoria
 * no centro; sem hover, mostra o total do período.
 */
function DonutChart({ segs, total, centerLabel, size = 208 }: { segs: { name: string; value: number; color: string }[]; total: number; centerLabel: string; size?: number }) {
  const [hover, setHover] = React.useState<number | null>(null);
  const cx = size / 2;
  const outerR = 96, innerR = 74;
  const sw = outerR - innerR; // 22
  const R = (outerR + innerR) / 2;
  const C = 2 * Math.PI * R;
  const GAP = 2;
  let acc = 0;
  const arcs = segs.map((s, i) => {
    const frac = total > 0 ? s.value / total : 0;
    const drawn = Math.max(0.5, frac * C - GAP);
    const off = -acc * C;
    acc += frac;
    return { ...s, i, drawn, off };
  });
  const sel = hover != null ? segs[hover] : null;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${centerLabel}: ${formatBRL(total)}`}>
        <g transform={`rotate(-90 ${cx} ${cx})`} fill="none" strokeLinecap="butt" strokeWidth={sw}>
          {arcs.map((a) => (
            <circle
              key={a.i}
              cx={cx} cy={cx} r={R}
              stroke={a.color}
              strokeDasharray={`${a.drawn} ${C - a.drawn}`}
              strokeDashoffset={a.off}
              strokeOpacity={hover == null || hover === a.i ? 1 : 0.38}
              style={{ transition: "stroke-opacity 0.15s ease", cursor: "pointer" }}
              onMouseEnter={() => setHover(a.i)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-8">
        <span className="text-[12px] text-muted leading-tight truncate max-w-full">{sel ? sel.name : centerLabel}</span>
        <span className="text-[22px] font-semibold leading-none mt-[6px] whitespace-nowrap text-ink" style={{ fontVariantNumeric: "tabular-nums", letterSpacing: "0.2px" }} title={formatBRL(sel ? sel.value : total)}>
          {brlNoCents(sel ? sel.value : total)}
        </span>
      </div>
    </div>
  );
}

function SaldoTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload as Ponto;
  const projetado = p.saldo == null;
  const valor = p.saldo ?? p.proj ?? 0;
  return (
    <div className="bg-white rounded-card border border-border px-4 py-3 text-caption" style={{ boxShadow: "0 6px 20px rgba(14,19,30,0.14)" }}>
      <div className="text-[15px] font-semibold text-ink mb-2">{p.label}</div>
      <TipRow color={projetado ? PROJ : POSITIVE} k={projetado ? "Saldo (proj.)" : "Saldo"} v={formatBRL(valor)} />
      {p.prev != null && <TipRow color={ORANGE} k="Período anterior" v={formatBRL(p.prev)} />}
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
