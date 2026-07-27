"use client";

/**
 * Topo da Home — réplica fiel do Visor Finance, na identidade all4pay
 * (monocromático + lime; o azul do Visor vira ink/lime):
 *  • ESQUERDA: herói "Você gastou R$ X a menos este mês" + gráfico de GASTO
 *    ACUMULADO. A linha do realizado usa um gradiente TÉRMICO (verde → âmbar →
 *    laranja → cor do desfecho), com área suave por baixo; o mês ANTERIOR é a
 *    tracejada cinza (régua de comparação) e a projeção segue a cor do desfecho,
 *    esmaecida. Balão no fim da linha, verde se gastou menos e vermelho se
 *    gastou mais. Abaixo, o card "Dica" (ink + lime) com insight + carrossel.
 *  • DIREITA: "Distribuição dos gastos" — donut + centro "Gasto total em {mês}"
 *    e legenda rica (tile colorido · nome · % · valor · tendência vs. mês ant.).
 * Tudo derivado do mesmo RiskInput (demo/live idêntico). Flat (sem sombra/borda).
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, Tooltip, LabelList,
} from "recharts";
import { Card, Skeleton, Icon, InfoHint } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import { useRiscoInput } from "./hooks";
import { usePeriod, MES_ABBR, MESES } from "./PeriodContext";
import { AnimatedBRL } from "./useCountUp";

const POSITIVE = "var(--color-positive)";
const NEGATIVE = "var(--color-negative)";
const PROJ = "#c9cdd4";
import { chartAnim } from "@/lib/chart-anim";
/* paleta categórica do data-viz — cores vibrantes e distintas */
// Paleta da MARCA (lima → verde → oliva → taupe → ink): a maior fatia herda o
// lima (herói) e as menores desbotam pros neutros — distinção sem sair da marca.
const DV = ["#C8E600", "#93B300", "#5F7D1F", "#3F5A22", "#8A876F", "#B4B0A0", "#6B6A5A", "#11190C"];
const brlNoCents = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const tint = (hex: string, a: number) => { if (!hex.startsWith("#")) return hex; const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

const effDate = (mv: { paid_date?: string | null; due_date: string }) => mv.paid_date || mv.due_date;

type Ponto = { idx: number; label: string; gasto: number | null; proj: number | null; prev: number | null; tip: number | null };
type Seg = { name: string; value: number; color: string; trend: number };

/** Altura do gráfico do herói (também ancora o gradiente vertical). */
const ALTURA = 210;

export function VisorHomeTop() {
  const { data: inp, isLoading } = useRiscoInput();
  const period = usePeriod();
  const router = useRouter();
  const [tipoDist, setTipoDist] = React.useState<"entrada" | "saida">("saida");
  // Largura real do gráfico — os gradientes usam `userSpaceOnUse` e precisam
  // de coordenadas em pixels (vide o comentário no <defs>).
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const [largura, setLargura] = React.useState(520);
  React.useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLargura(el.clientWidth || 520));
    ro.observe(el);
    setLargura(el.clientWidth || 520);
    return () => ro.disconnect();
  }, []);

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

    // gasto por dia: PAGO (realizado, verde) vs AGENDADO (projeção, tracejada).
    // Realizado usa a data de caixa (paid_date); agendado usa o vencimento.
    const paidByDay = new Map<string, number>();
    const schedByDay = new Map<string, number>();
    for (const mv of inp.movements) {
      if (mv.type !== "saida" || mv.status === "cancelado") continue;
      const v = Math.abs(mv.amount);
      if (mv.status === "pago") {
        const ds = (mv.paid_date || mv.due_date || "").slice(0, 10); if (!ds) continue;
        paidByDay.set(ds, (paidByDay.get(ds) || 0) + v);
      } else {
        const ds = (mv.due_date || "").slice(0, 10); if (!ds) continue;
        schedByDay.set(ds, (schedByDay.get(ds) || 0) + v);
      }
    }
    const paidOn = (iso: string) => paidByDay.get(iso) || 0;
    const schedOn = (iso: string) => schedByDay.get(iso) || 0;

    // acumulado de gasto PAGO — período atual (cumA) e anterior (cumP)
    const cumA: number[] = []; let cA = 0;
    const cumP: number[] = []; let cP = 0;
    for (let i = 0; i < nDays; i++) {
      cA += paidOn(isoAt(fromD, i)); cumA.push(Math.round(cA * 100) / 100);
      cP += paidOn(isoAt(prevFromD, i)); cumP.push(Math.round(cP * 100) / 100);
    }
    const rawDidx = Math.round((hojeD.getTime() - fromD.getTime()) / DAY);
    const Didx = Math.max(0, Math.min(nDays - 1, rawDidx));
    // projeção: do hoje em diante = pago acumulado + agendado a vencer
    const projCum: number[] = new Array(nDays).fill(0);
    let base = cumA[Didx], sc = 0;
    for (let i = Didx; i < nDays; i++) { if (i > Didx) sc += schedOn(isoAt(fromD, i)); projCum[i] = Math.round((base + sc) * 100) / 100; }
    const fmtDia = (d: Date) => `${pad(d.getDate())}/${MES_ABBR[d.getMonth()]}`;
    const temProj = rawDidx < nDays - 1 && rawDidx >= -1;
    const serie: Ponto[] = [];
    for (let i = 0; i < nDays; i++) {
      const d = new Date(fromD.getTime() + i * DAY);
      serie.push({ idx: i, label: fmtDia(d), gasto: i <= Didx ? cumA[i] : null, proj: i >= Didx ? projCum[i] : null, prev: cumP[i], tip: i === Didx ? cumA[Didx] : null });
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

  // Gradiente CONDICIONAL da linha: ponto a ponto, VERDE onde o acumulado está
  // abaixo do mês anterior (economia) e VERMELHO onde passou dele. Os stops
  // ficam lado a lado, então o SVG interpola e a virada de cor cai exatamente
  // onde o gasto cruza a régua do mês passado.
  // Hook INCONDICIONAL (antes de qualquer early return): tolera `calc` nulo.
  const stops = React.useMemo(() => {
    const pts = calc?.serie ?? [];
    const n = pts.length;
    if (!n) return [{ off: 0, cor: POSITIVE }];
    return pts.map((p, i) => {
      const atual = p.gasto ?? p.proj ?? 0;
      const anterior = p.prev ?? 0;
      return { off: n > 1 ? (i / (n - 1)) * 100 : 0, cor: anterior >= atual ? POSITIVE : NEGATIVE };
    });
  }, [calc]);

  if (isLoading || !inp || !calc) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <Card><Skeleton className="h-[340px] w-full" rounded="md" /></Card>
        <Card><Skeleton className="h-[340px] w-full" rounded="md" /></Card>
      </div>
    );
  }

  const bom = calc.bom; // gastou menos = bom (verde)
  // Cor do DESFECHO: fecha vermelho se gastou mais, verde se gastou menos.
  // Ela tinge o fim do gradiente, a área, a projeção, o ponto e o balão.
  const fim = bom ? POSITIVE : NEGATIVE;
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
          <div className="flex items-center gap-3">
            <span className="text-[16px] font-semibold text-ink">Você gastou</span>
          </div>
          <div className="flex items-baseline gap-2 mt-2 flex-wrap">
            <span className="text-[34px] font-semibold tabular-nums text-ink leading-none"><AnimatedBRL value={Math.abs(calc.delta)} /></span>
            <span className="text-[18px] text-muted">a {bom ? "menos" : "mais"} {sufixo}</span>
          </div>

          <div className="relative mt-4" ref={boxRef}>
            <figure className="m-0" role="img" aria-label={`Gasto acumulado ${mesNome ? "em " + mesNome : "no período"}: ${formatBRL(calc.gastoAtual)}; ${bom ? "abaixo" : "acima"} do mês anterior em ${formatBRL(Math.abs(calc.delta))}.`}>
              {/* altura maior + folga no topo: o balão da referência é alto e
                  precisa de espaço sem encostar na linha. */}
              <ResponsiveContainer width="100%" height={ALTURA}>
                <ComposedChart data={calc.serie} margin={{ top: 34, right: 10, bottom: 4, left: 8 }}>
                  <defs>
                    {/* `userSpaceOnUse` de propósito: em `objectBoundingBox` (o
                        padrão) o SVG NÃO desenha o gradiente quando a bbox tem
                        largura ou altura zero — e a linha do gasto fica achatada
                        sempre que o mês corrente é bem menor que o anterior.
                        Por isso ancoramos nas dimensões reais do gráfico. */}
                    <linearGradient id="visorTermica" gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={largura} y2={0}>
                      {stops.map((s, i) => (
                        <stop key={i} offset={`${s.off}%`} stopColor={s.cor} />
                      ))}
                    </linearGradient>
                    {/* Preenchimento suave sob a linha, na cor do desfecho. */}
                    <linearGradient id="visorFill" gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={0} y2={ALTURA}>
                      <stop offset="0%" stopColor={fim} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={fim} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" hide />
                  <YAxis hide domain={[0, "auto"]} />
                  <Tooltip content={<GastoTooltip />} cursor={{ stroke: "#c9cdd4", strokeDasharray: "3 3" }} />
                  {/* área sob o realizado */}
                  <Area type="monotone" dataKey="gasto" stroke="none" fill="url(#visorFill)" {...chartAnim()} connectNulls />
                  {/* mês anterior — tracejada cinza fina (régua de comparação) */}
                  <Line type="monotone" dataKey="prev" stroke={PROJ} strokeWidth={1.8} strokeDasharray="7 6" strokeLinecap="round" dot={false} activeDot={{ r: 4 }} {...chartAnim(120)} connectNulls />
                  {/* projeção — segue a cor do desfecho, esmaecida */}
                  <Line type="monotone" dataKey="proj" stroke={fim} strokeOpacity={0.3} strokeWidth={2.5} strokeDasharray="5 4" strokeLinecap="round" dot={false} {...chartAnim(240)} connectNulls />
                  {/* gasto realizado — traço GROSSO com o gradiente térmico */}
                  <Line type="monotone" dataKey="gasto" stroke="url(#visorTermica)" strokeWidth={4.2} strokeLinecap="round" strokeLinejoin="round" dot={false} activeDot={{ r: 5, fill: fim, stroke: "#fff", strokeWidth: 2 }} {...chartAnim()} connectNulls />
                  {/* âncora invisível do balão */}
                  <Line dataKey="tip" stroke="transparent" dot={false} isAnimationActive={false} legendType="none">
                    <LabelList dataKey="tip" content={<Callout text={bubbleText} good={bom} />} />
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
            </figure>
            {/* Sem legenda: a referência não tem. O significado das linhas vive
                no tooltip (hover) e no botão "i" do card. */}
          </div>
        </Card>

        <DicaCard insight={calc.insight} sufixo={sufixo} onOpen={() => router.push("/dre")} />
      </div>

      {/* DIREITA — Distribuição (donut + legenda rica) */}
      <Card className="flex flex-col">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-3 text-[16px] font-semibold text-ink">
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
                    className={`text-caption font-medium rounded-pill px-3 py-[6px] transition-colors ${on ? "bg-white text-ink" : "text-muted hover:text-ink"}`}>{label}</button>
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
/** Quebra o texto do balão em linhas curtas (o balão da referência é ALTO e
 *  estreito, não uma pílula larga). */
function quebrar(texto: string, max = 10): string[] {
  const linhas: string[] = [];
  let atual = "";
  for (const w of String(texto).split(" ")) {
    const tent = atual ? `${atual} ${w}` : w;
    if (tent.length > max && atual) { linhas.push(atual); atual = w; }
    else atual = tent;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

function Callout(props: any) {
  const { x, y, value, text, good, viewBox } = props;
  if (value == null || typeof x !== "number" || typeof y !== "number") return null;
  // Balão na cor do DESFECHO (verde gastou menos · vermelho gastou mais).
  // Formato da referência: retângulo ALTO no topo-direita, texto quebrado em
  // várias linhas e um bico curto apontando para baixo. O ponto final é um
  // círculo sólido na mesma cor.
  const bg = good ? "var(--color-positive)" : "var(--color-negative)";
  const larguraArea = typeof viewBox?.width === "number" ? viewBox.width : 340;
  const linhas = quebrar(text);
  const lh = 16, padY = 9, padX = 11, tail = 7;
  const bw = Math.max(74, ...linhas.map((l) => l.length * 7.1 + padX * 2));
  const bh = linhas.length * lh + padY * 2;
  // encostado no topo e alinhado com o ponto, sem sair da área do gráfico
  const bx = Math.max(2, Math.min(x - bw / 2, larguraArea - bw - 2));
  const by = 0;
  const tx = Math.max(bx + 12, Math.min(x, bx + bw - 12));
  return (
    <g style={{ pointerEvents: "none" }}>
      <rect x={bx} y={by} width={bw} height={bh} rx={10} fill={bg} />
      {/* bico curto, apontando para baixo */}
      <polygon points={`${tx - 6},${by + bh} ${tx + 6},${by + bh} ${tx},${by + bh + tail}`} fill={bg} />
      {/* ponto final — sólido, como na referência */}
      <circle cx={x} cy={y} r={5.5} fill={bg} />
      {linhas.map((l, i) => (
        <text
          key={i}
          x={bx + bw / 2}
          y={by + padY + i * lh + lh / 2}
          fill="#fff"
          fontSize={13}
          fontWeight={700}
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {l}
        </text>
      ))}
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
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="text-[15px] font-semibold text-ink">Dica all4pay</span>
        <button onClick={onOpen} aria-label="Abrir detalhe" className="ml-auto w-7 h-7 rounded-pill inline-flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2 transition-colors">
          <Icon name="arrow-up-right" size={16} color="currentColor" />
        </button>
      </div>
      <p className="m-0 text-[15px] leading-snug text-muted min-h-[44px]">{dicas[i]}</p>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-[6px] flex-1">
          {dicas.map((_, k) => (
            <span key={k} className="h-[6px] rounded-pill transition-all" style={{ width: k === i ? 20 : 6, background: k === i ? "var(--color-lime)" : "var(--color-surface-3)" }} />
          ))}
        </div>
        <button onClick={() => go(-1)} aria-label="Dica anterior" className="w-8 h-8 rounded-pill inline-flex items-center justify-center bg-surface-2 text-muted hover:text-ink hover:bg-surface-3 transition-colors">
          <Icon name="chevron-left" size={16} color="currentColor" />
        </button>
        <button onClick={() => go(1)} aria-label="Próxima dica" className="w-8 h-8 rounded-pill inline-flex items-center justify-center bg-surface-2 text-muted hover:text-ink hover:bg-surface-3 transition-colors">
          <Icon name="chevron-right" size={16} color="currentColor" />
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
    <div className="bg-white rounded-card px-4 py-3 text-caption">
      <div className="text-[15px] font-semibold text-ink mb-2">{p.label}</div>
      <TipRow color={projetado ? PROJ : POSITIVE} k={projetado ? "Gasto (proj.)" : "Gasto acum."} v={formatBRL(valor)} />
      {/* cinza: casa com a tracejada do mês anterior no gráfico */}
      {p.prev != null && <TipRow color={PROJ} k="Mês anterior" v={formatBRL(p.prev)} />}
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

