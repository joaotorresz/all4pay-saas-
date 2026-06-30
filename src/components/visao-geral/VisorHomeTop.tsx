"use client";

/**
 * Topo da Home — réplica fiel do Visor Finance, na identidade all4pay
 * (monocromático + lime; o azul do Visor vira ink/lime):
 *  • ESQUERDA: herói "Você gastou R$ X a menos este mês" + gráfico de GASTO
 *    ACUMULADO (verde = realizado até hoje · tracejada = projeção · laranja =
 *    mesmo intervalo do mês ANTERIOR) com balão no fim da linha. Abaixo, o card
 *    "Dica" (ink + lime) com insight dinâmico + carrossel.
 *  • DIREITA: "Distribuição dos gastos" — donut + centro "Gasto total em {mês}"
 *    e legenda rica (tile colorido · nome · % · valor · tendência vs. mês ant.).
 * Tudo derivado do mesmo RiskInput (demo/live idêntico). Flat (sem sombra/borda).
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer, LineChart, Line, Area, XAxis, YAxis, Tooltip, LabelList,
} from "recharts";
import { Card, Skeleton, Icon, InfoHint } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import { useRiscoInput } from "./hooks";
import { usePeriod, MES_ABBR, MESES } from "./PeriodContext";
import { AnimatedBRL } from "./useCountUp";

const POSITIVE = "var(--color-positive)";
const NEGATIVE = "var(--color-negative)";
const ORANGE = "var(--color-warning)";
const PROJ = "#c9cdd4";
/* paleta categórica do data-viz — cores vibrantes e distintas */
const DV = ["#FF3B30", "#2F6BFF", "#FF2D8E", "#00B8D4", "#FFB300", "#8B5CF6", "#10B981", "#F97316"];
const brlNoCents = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const tint = (hex: string, a: number) => { if (!hex.startsWith("#")) return hex; const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

const effDate = (mv: { paid_date?: string | null; due_date: string }) => mv.paid_date || mv.due_date;

type Ponto = { idx: number; label: string; gasto: number | null; proj: number | null; prev: number | null; tip: number | null };
type Seg = { name: string; value: number; color: string; trend: number };

export function VisorHomeTop() {
  const { data: inp, isLoading } = useRiscoInput();
  const period = usePeriod();
  const router = useRouter();
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
    const prevFromD = new Date(fromD.getTime() - nDays * DAY);

    // gasto (saídas) por dia
    const spendByDay = new Map<string, number>();
    for (const mv of inp.movements) {
      if (mv.type !== "saida" || mv.status === "cancelado") continue;
      const ds = effDate(mv); if (!ds) continue;
      spendByDay.set(ds.slice(0, 10), (spendByDay.get(ds.slice(0, 10)) || 0) + Math.abs(mv.amount));
    }
    const spendOn = (iso: string) => spendByDay.get(iso) || 0;

    // acumulado de gasto — período atual e anterior (mesmo intervalo)
    const cumA: number[] = []; let cA = 0;
    const cumP: number[] = []; let cP = 0;
    for (let i = 0; i < nDays; i++) {
      cA += spendOn(isoAt(fromD, i)); cumA.push(Math.round(cA * 100) / 100);
      cP += spendOn(isoAt(prevFromD, i)); cumP.push(Math.round(cP * 100) / 100);
    }
    const rawDidx = Math.round((hojeD.getTime() - fromD.getTime()) / DAY);
    const Didx = Math.max(0, Math.min(nDays - 1, rawDidx));
    const fmtDia = (d: Date) => `${pad(d.getDate())}/${MES_ABBR[d.getMonth()]}`;
    const temProj = rawDidx < nDays - 1 && rawDidx >= -1;
    const serie: Ponto[] = [];
    for (let i = 0; i < nDays; i++) {
      const d = new Date(fromD.getTime() + i * DAY);
      serie.push({ idx: i, label: fmtDia(d), gasto: i <= Didx ? cumA[i] : null, proj: i >= Didx ? cumA[i] : null, prev: cumP[i], tip: i === Didx ? cumA[Didx] : null });
    }
    const gastoAtual = cumA[Didx];
    const gastoAnterior = cumP[Didx];
    const delta = gastoAnterior - gastoAtual; // > 0 → gastou MENOS este mês (bom)

    // distribuição por categoria — atual + anterior (p/ tendência)
    const inWin = (t: number, a: Date, b: Date) => t >= a.getTime() && t <= b.getTime();
    const catS = new Map<string, number>(), catE = new Map<string, number>();
    const catSPrev = new Map<string, number>(), catEPrev = new Map<string, number>();
    let entradas = 0, saidas = 0;
    const prevToD = new Date(prevFromD.getTime() + (nDays - 1) * DAY);
    for (const mv of inp.movements) {
      if (mv.status === "cancelado") continue;
      const ds = effDate(mv); if (!ds) continue;
      const t = parse(ds.slice(0, 10)).getTime();
      const v = Math.abs(mv.amount);
      const c = (mv.category || "Outros").trim() || "Outros";
      if (inWin(t, fromD, toD)) {
        if (mv.type === "entrada") { entradas += v; catE.set(c, (catE.get(c) || 0) + v); }
        else { saidas += v; catS.set(c, (catS.get(c) || 0) + v); }
      } else if (inWin(t, prevFromD, prevToD)) {
        if (mv.type === "entrada") catEPrev.set(c, (catEPrev.get(c) || 0) + v);
        else catSPrev.set(c, (catSPrev.get(c) || 0) + v);
      }
    }
    const buildSegs = (map: Map<string, number>, prevMap: Map<string, number>): Seg[] => {
      const arr = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
      const top = arr.slice(0, 7);
      const resto = arr.slice(7).reduce((s, [, v]) => s + v, 0);
      const segs: Seg[] = top.map(([n, v], i) => ({ name: n, value: v, color: DV[i % DV.length], trend: v - (prevMap.get(n) || 0) }));
      if (resto > 0) segs.push({ name: "Outros", value: resto, color: PROJ, trend: 0 });
      return segs;
    };

    // insight dinâmico p/ o card Dica — categoria com maior variação de gasto
    let insight: { cat: string; valor: number; mais: boolean } | null = null;
    let maxAbs = 0;
    for (const [c, v] of Array.from(catS)) {
      const diff = v - (catSPrev.get(c) || 0);
      if (Math.abs(diff) > Math.abs(maxAbs)) { maxAbs = diff; insight = { cat: c, valor: Math.abs(diff), mais: diff > 0 }; }
    }

    return {
      serie, Didx, temProj, delta, bom: delta >= 0, gastoAtual,
      entradas, saidas,
      segsEntrada: buildSegs(catE, catEPrev), segsSaida: buildSegs(catS, catSPrev),
      insight,
    };
  }, [inp, period.from, period.to]);

  if (isLoading || !inp || !calc) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <Card><Skeleton className="h-[340px] w-full" rounded="md" /></Card>
        <Card><Skeleton className="h-[340px] w-full" rounded="md" /></Card>
      </div>
    );
  }

  const bom = calc.bom; // gastou menos = bom (verde)
  const sufixo = period.modo === "mes" ? "este mês" : "no período";
  const bubbleText = `${formatBRL(Math.abs(calc.delta))} a ${bom ? "menos" : "mais"} ${sufixo}`;
  const mesNome = period.modo === "mes" ? MESES[period.mes] : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5 items-start">
      {/* ESQUERDA — herói (gasto comparado) + Dica */}
      <div className="flex flex-col gap-5">
        <Card className="flex flex-col" info={{
          titulo: "Você gastou",
          oQue: "Quanto você gastou no período vs. o mês anterior. Verde = gasto realizado até hoje · laranja = mesmo intervalo do mês passado · tracejada = projeção até o fim do período.",
          comoCalcula: "Soma das saídas pagas, acumuladas dia a dia. A diferença em destaque é o total deste período menos o do anterior no mesmo ponto do mês.",
        }}>
          <span className="text-[16px] font-semibold text-ink">Você gastou</span>
          <div className="flex items-baseline gap-2 mt-2 flex-wrap">
            <span className="text-[34px] font-semibold tabular-nums text-ink leading-none"><AnimatedBRL value={Math.abs(calc.delta)} /></span>
            <span className="text-[18px] text-muted">a {bom ? "menos" : "mais"} {sufixo}</span>
          </div>

          <div className="relative mt-4">
            <figure className="m-0" role="img" aria-label={`Gasto acumulado ${mesNome ? "em " + mesNome : "no período"}: ${formatBRL(calc.gastoAtual)}; ${bom ? "abaixo" : "acima"} do mês anterior em ${formatBRL(Math.abs(calc.delta))}.`}>
              <ResponsiveContainer width="100%" height={188}>
                <LineChart data={calc.serie} margin={{ top: 28, right: 8, bottom: 0, left: 8 }}>
                  <defs>
                    <linearGradient id="visorGlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#28AA00" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="#28AA00" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" hide />
                  <YAxis hide domain={[0, "auto"]} />
                  <Tooltip content={<GastoTooltip />} cursor={{ stroke: "#c9cdd4", strokeDasharray: "3 3" }} />
                  <Area type="monotone" dataKey="gasto" stroke="none" fill="url(#visorGlow)" isAnimationActive={false} connectNulls />
                  {/* mês anterior — laranja */}
                  <Line type="monotone" dataKey="prev" stroke={ORANGE} strokeWidth={1.8} dot={false} isAnimationActive={false} connectNulls />
                  {/* projeção — tracejada cinza */}
                  <Line type="monotone" dataKey="proj" stroke={PROJ} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} connectNulls />
                  {/* gasto realizado — verde */}
                  <Line type="monotone" dataKey="gasto" stroke={POSITIVE} strokeWidth={2.4} dot={false} activeDot={{ r: 4, fill: POSITIVE, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} connectNulls />
                  {/* âncora invisível do balão */}
                  <Line dataKey="tip" stroke="transparent" dot={false} isAnimationActive={false} legendType="none">
                    <LabelList dataKey="tip" content={<Callout text={bubbleText} good={bom} />} />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </figure>
            <div className="flex items-center gap-4 text-caption text-muted flex-wrap mt-1">
              <Leg color={POSITIVE} label="Gasto realizado" />
              <Leg color={ORANGE} label="Mês anterior" />
              {calc.temProj && (
                <span className="inline-flex items-center gap-[6px]">
                  <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: PROJ }} /> Projeção
                </span>
              )}
            </div>
          </div>
        </Card>

        <DicaCard insight={calc.insight} sufixo={sufixo} onOpen={() => router.push("/dre")} />
      </div>

      {/* DIREITA — Distribuição (donut + legenda rica) */}
      <Card className="flex flex-col">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-[16px] font-semibold text-ink">
            {tipoDist === "saida" ? "Distribuição dos gastos" : "Distribuição das entradas"}
            <InfoHint align="left"
              oQue="Para onde foi (ou de onde veio) o dinheiro no período, por categoria."
              comoCalcula="Soma dos lançamentos do período por categoria; o % é a fatia de cada uma no total. A tendência ▲/▼ compara com o mês anterior." />
          </span>
          <div className="flex items-center gap-2">
            <div className="flex p-1 gap-1 rounded-pill bg-surface-2" role="tablist" aria-label="Tipo de distribuição">
              {([["entrada", "Entradas"], ["saida", "Saídas"]] as const).map(([val, label]) => {
                const on = tipoDist === val;
                return (
                  <button key={val} role="tab" aria-selected={on} onClick={() => setTipoDist(val)}
                    className={`text-caption font-medium rounded-pill px-3 py-[6px] transition-colors ${on ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}>{label}</button>
                );
              })}
            </div>
            <button onClick={() => router.push("/dre")} aria-label="Abrir DRE" className="w-8 h-8 rounded-md inline-flex items-center justify-center text-faint hover:text-ink hover:bg-surface-2 transition-colors">
              <Icon name="arrow-up-right" size={16} color="currentColor" />
            </button>
          </div>
        </div>

        {(() => {
          const segs = tipoDist === "entrada" ? calc.segsEntrada : calc.segsSaida;
          const total = tipoDist === "entrada" ? calc.entradas : calc.saidas;
          const ent = tipoDist === "entrada";
          const centerLabel = `${ent ? "Total recebido" : "Gasto total"}${mesNome ? " em " + mesNome : ""}`;
          return (
            <div className="flex flex-col sm:flex-row sm:items-center gap-5 mt-4">
              <DonutChart segs={segs} total={total} centerLabel={ent ? "Total" : "Gasto total"} size={188} />
              <div className="flex-1 min-w-0 w-full flex flex-col">
                <span className="text-caption text-faint mb-1 sm:hidden">{centerLabel}</span>
                {segs.map((s, i) => {
                  const pct = total > 0 ? Math.round((s.value / total) * 1000) / 10 : 0;
                  const subiu = s.trend > 0; // gastou/recebeu mais que o mês anterior
                  return (
                    <div key={i} className={`flex items-center gap-3 py-[9px] ${i ? "border-t border-border-soft" : ""}`}>
                      <span className="w-8 h-8 rounded-md inline-flex items-center justify-center shrink-0" style={{ background: tint(s.color, 0.15) }}>
                        <span className="w-3 h-3 rounded-sm" style={{ background: s.color }} />
                      </span>
                      <span className="text-[15px] text-ink truncate">{s.name}</span>
                      <span className="text-[12px] text-muted bg-surface-2 rounded-pill px-2 py-[1px] shrink-0" style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>{pct.toLocaleString("pt-BR")}%</span>
                      <span className="flex-1" />
                      <span className="text-[15px] font-semibold tabular-nums text-ink shrink-0 whitespace-nowrap">{brlNoCents(s.value)}</span>
                      {s.trend !== 0 && (
                        <span className="inline-flex items-center justify-center w-7 h-[22px] rounded-sm shrink-0"
                          style={{ background: subiu ? tint("#C2473D", 0.10) : "rgba(63,143,91,0.12)" }}>
                          <Icon name={subiu ? "trending-up" : "trending-down"} size={13} color={subiu ? "var(--color-negative)" : "var(--color-positive)"} />
                        </span>
                      )}
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

/** Balão de callout no fim da linha — igual ao Visor (verde sólido, rabo p/ baixo). */
function Callout(props: any) {
  const { x, y, value, text, good } = props;
  if (value == null || typeof x !== "number" || typeof y !== "number") return null;
  const bg = good ? POSITIVE : NEGATIVE;
  const H = 188, bh = 30, tail = 9;
  const bw = Math.max(150, text.length * 7.2 + 26);
  const bx = Math.max(4, x - bw);
  const tx = Math.min(bx + bw - 16, x);
  const above = y - tail - bh >= 4;
  const by = above ? y - tail - bh : Math.min(y + tail, H - bh - 2);
  const baseY = above ? by + bh : by;
  return (
    <g style={{ pointerEvents: "none" }}>
      <rect x={bx} y={by} width={bw} height={bh} rx={12} fill={bg} />
      <polygon points={`${tx - 8},${baseY} ${tx + 8},${baseY} ${x},${y}`} fill={bg} />
      <circle cx={x} cy={y} r={4} fill={bg} stroke="#fff" strokeWidth={2} />
      <text x={bx + bw / 2} y={by + bh / 2} fill="#fff" fontSize={13} fontWeight={600} textAnchor="middle" dominantBaseline="central" style={{ fontVariantNumeric: "tabular-nums" }}>
        {text}
      </text>
    </g>
  );
}

/**
 * Card "Dica" (= "Dica do Visor", na identidade all4pay: ink + lime). Mostra um
 * insight DINÂMICO (categoria que mais variou vs. mês anterior) + dicas curadas,
 * com carrossel (bolinhas/setas) e atalho ↗.
 */
const DICAS_BASE = [
  "Defina um limite mensal de gastos para ver projeções do seu saldo nos próximos meses.",
  "Conecte um extrato (OFX/CSV) em Upload para classificar seus lançamentos automaticamente.",
  "Cadastre seus contratos em Recorrências para projetar a receita contratada (MRR) no fluxo.",
];
function DicaCard({ insight, sufixo, onOpen }: { insight: { cat: string; valor: number; mais: boolean } | null; sufixo: string; onOpen: () => void }) {
  const dicas = React.useMemo(() => {
    const arr = [...DICAS_BASE];
    if (insight && insight.valor > 0) arr.unshift(`Você gastou ${formatBRL(insight.valor)} a ${insight.mais ? "mais" : "menos"} em ${insight.cat} ${sufixo} vs. o mês passado.`);
    return arr;
  }, [insight, sufixo]);
  const [i, setI] = React.useState(0);
  React.useEffect(() => { setI(0); }, [dicas.length]);
  const go = (d: number) => setI((p) => (p + d + dicas.length) % dicas.length);
  return (
    <Card className="bg-ink text-white flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-md inline-flex items-center justify-center" style={{ background: "var(--color-lime)" }}>
          <Icon name="sparkles" size={16} color="var(--color-on-lime)" />
        </span>
        <span className="text-[15px] font-semibold">Dica all4pay</span>
        <button onClick={onOpen} aria-label="Abrir detalhe" className="ml-auto w-7 h-7 rounded-md inline-flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors">
          <Icon name="arrow-up-right" size={16} color="currentColor" />
        </button>
      </div>
      <p className="m-0 text-[15px] leading-snug text-white/85 min-h-[44px]">{dicas[i]}</p>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-[6px] flex-1">
          {dicas.map((_, k) => (
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

/** Donut SVG próprio (determinístico) — nunca distorce; hover destaca + centro. */
function DonutChart({ segs, total, centerLabel, size = 208 }: { segs: { name: string; value: number; color: string }[]; total: number; centerLabel: string; size?: number }) {
  const [hover, setHover] = React.useState<number | null>(null);
  const cx = size / 2;
  const outerR = size * 0.46, innerR = size * 0.355;
  const sw = outerR - innerR;
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
    <div className="relative shrink-0 mx-auto sm:mx-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${centerLabel}: ${formatBRL(total)}`}>
        <g transform={`rotate(-90 ${cx} ${cx})`} fill="none" strokeLinecap="butt" strokeWidth={sw}>
          {arcs.map((a) => (
            <circle key={a.i} cx={cx} cy={cx} r={R} stroke={a.color}
              strokeDasharray={`${a.drawn} ${C - a.drawn}`} strokeDashoffset={a.off}
              strokeOpacity={hover == null || hover === a.i ? 1 : 0.38}
              style={{ transition: "stroke-opacity 0.15s ease", cursor: "pointer" }}
              onMouseEnter={() => setHover(a.i)} onMouseLeave={() => setHover(null)} />
          ))}
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-6">
        <span className="text-[11px] text-muted leading-tight truncate max-w-full">{sel ? sel.name : centerLabel}</span>
        <span className="text-[20px] font-semibold leading-none mt-[5px] whitespace-nowrap text-ink" style={{ fontVariantNumeric: "tabular-nums" }} title={formatBRL(sel ? sel.value : total)}>
          {brlNoCents(sel ? sel.value : total)}
        </span>
      </div>
    </div>
  );
}

function GastoTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload as Ponto;
  const projetado = p.gasto == null;
  const valor = p.gasto ?? p.proj ?? 0;
  return (
    <div className="bg-white rounded-card border border-border px-4 py-3 text-caption" style={{ boxShadow: "0 6px 20px rgba(14,19,30,0.14)" }}>
      <div className="text-[15px] font-semibold text-ink mb-2">{p.label}</div>
      <TipRow color={projetado ? PROJ : POSITIVE} k={projetado ? "Gasto (proj.)" : "Gasto acum."} v={formatBRL(valor)} />
      {p.prev != null && <TipRow color={ORANGE} k="Mês anterior" v={formatBRL(p.prev)} />}
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
