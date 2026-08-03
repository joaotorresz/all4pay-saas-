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
import {
  painelIndicadores, janela, janelaAnterior, dentro, contemHoje, dataDe, magnitude,
} from "@/core/indicadores";
import { useRiscoInput } from "./hooks";
import { ErroWidget } from "./shared";
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

type Ponto = { idx: number; label: string; ent: number; sai: number };
type Seg = { name: string; value: number; color: string; trend: number };

/** Altura do gráfico do herói (também ancora o gradiente vertical). */
const ALTURA = 210;
/** Roobert Semi Mono — escolha do Laboratório p/ o prefixo R$ e a legenda. */
const SEMI_MONO = '"Roobert Semi Mono", ui-monospace, monospace';
/** Roobert Variable — a fonte dos títulos e do inteiro do herói. */
const VARIAVEL = '"Roobert Variable", "Roobert", sans-serif';

export function VisorHomeTop() {
  const { data: inp, isLoading, error, refetch } = useRiscoInput();
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
    const nDays = Math.max(1, Math.round((toD.getTime() - fromD.getTime()) / DAY) + 1);

    // Duas séries acumuladas no período: ENTRADAS e SAÍDAS liquidadas.
    // Só o que teve baixa entra (é a leitura do que de fato passou no caixa);
    // a data que conta é a do pagamento.
    const entByDay = new Map<string, number>();
    const saiByDay = new Map<string, number>();
    for (const mv of inp.movements) {
      const ds = dataDe(mv, "caixa");
      if (!ds) continue;
      const alvo = mv.type === "entrada" ? entByDay : saiByDay;
      alvo.set(ds, (alvo.get(ds) || 0) + magnitude(mv));
    }
    const fmtDia = (d: Date) => `${pad(d.getDate())}/${MES_ABBR[d.getMonth()]}`;
    const serie: Ponto[] = [];
    let accE = 0, accS = 0;
    for (let i = 0; i < nDays; i++) {
      const iso = isoAt(fromD, i);
      accE += entByDay.get(iso) || 0;
      accS += saiByDay.get(iso) || 0;
      serie.push({
        idx: i,
        label: fmtDia(new Date(fromD.getTime() + i * DAY)),
        ent: Math.round(accE * 100) / 100,
        sai: Math.round(accS * 100) / 100,
      });
    }

    // distribuição por categoria — atual + anterior (p/ tendência).
    //
    // ⚠️ A JANELA e a REGRA vêm da camada canônica; este bloco só reparte por
    // categoria o que ela já decidiu que conta. Antes o card tinha DUAS regras
    // dentro de si: as linhas do gráfico contavam só `pago`, e estes totais
    // contavam `!== cancelado` com `paid_date || due_date` — então o rodapé
    // "resultado do período" e o donut incluíam títulos em aberto que as linhas
    // não incluíam, no mesmo card.
    const jAtual = janela(period.from, period.to);
    const jPrev = janelaAnterior(jAtual);
    const catS = new Map<string, number>(), catE = new Map<string, number>();
    const catSPrev = new Map<string, number>(), catEPrev = new Map<string, number>();
    for (const mv of inp.movements) {
      const ds = dataDe(mv, "caixa");
      if (!ds) continue;
      const v = magnitude(mv);
      const c = (mv.category || "Outros").trim() || "Outros";
      if (dentro(jAtual, ds)) {
        if (mv.type === "entrada") catE.set(c, (catE.get(c) || 0) + v);
        else catS.set(c, (catS.get(c) || 0) + v);
      } else if (dentro(jPrev, ds)) {
        if (mv.type === "entrada") catEPrev.set(c, (catEPrev.get(c) || 0) + v);
        else catSPrev.set(c, (catSPrev.get(c) || 0) + v);
      }
    }
    // Os três números do card saem da camada canônica — os mesmos que o DRE, o
    // fluxo de caixa e o extrato mostram para este período.
    const ind = painelIndicadores(inp, jAtual, "caixa");
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
      serie,
      entradas: ind.entradas.valor,
      saidas: ind.saidas.valor,
      resultado: ind.resultado.valor,
      saldo: ind.saldo.valor,
      janela: jAtual,
      segsEntrada: buildSegs(catE, catEPrev), segsSaida: buildSegs(catS, catSPrev),
      insight,
    };
  }, [inp, period.from, period.to]);

  // ⚠️ A falha tem estado PRÓPRIO. Antes, `isLoading || !inp` mandava tudo para
  // o esqueleto: consulta quebrada e consulta lenta ficavam idênticas na tela, e
  // um erro de rede se apresentava como "carregando" para sempre.
  if (error) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <Card><ErroWidget titulo="Não foi possível carregar o saldo" erro={error} onTentarNovamente={() => refetch()} /></Card>
        <Card><ErroWidget titulo="Não foi possível carregar a distribuição" erro={error} onTentarNovamente={() => refetch()} /></Card>
      </div>
    );
  }
  if (isLoading || !inp || !calc) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <Card><Skeleton className="h-[340px] w-full" rounded="md" /></Card>
        <Card><Skeleton className="h-[340px] w-full" rounded="md" /></Card>
      </div>
    );
  }

  // ⚠️ "este mês" só quando o mês navegado é o CORRENTE. Navegar para março e
  // ler "este mês" faz o número parecer errado quando está certo — é a mesma
  // confusão entre "mês selecionado" e "hoje" que a janela canônica separa.
  const ehMesCorrente = period.modo === "mes" && contemHoje(calc.janela, inp.hoje);
  const sufixo = ehMesCorrente ? "este mês" : period.modo === "mes" ? `em ${MESES[period.mes]}` : "no período";
  const mesNome = period.modo === "mes" ? MESES[period.mes] : null;
  // O herói do card é o SALDO EM CONTA (posição atual). O período manda no
  // gráfico e no resultado do rodapé.
  const saldo = calc.saldo;
  const positivoNoPeriodo = calc.resultado >= 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5 items-start">
      {/* ESQUERDA — herói (gasto comparado) + Dica */}
      <div className="flex flex-col gap-5">
        {/* Forma do card do herói (Laboratório): raio 32, padding 20, hairline. */}
        <Card className="flex flex-col rounded-[32px] p-5 border border-[#f1f3f5]" padded={false} info={{
          titulo: "Saldo em conta",
          oQue: "Quanto você tem em conta agora, com o que entrou (verde) e o que saiu (vermelho) ao longo do período.",
          comoCalcula: "O valor é o saldo consolidado das contas. As duas linhas acumulam, dia a dia, as entradas e as saídas já liquidadas no período; o resultado abaixo é entradas − saídas.",
        }}>
          <div className="flex items-center gap-3">
            {/* Título do card (Laboratório): Roobert Variable 15/400, −0.02em. */}
            <span className="text-[15px]" style={{ fontFamily: VARIAVEL, fontWeight: 400, letterSpacing: "-0.02em", color: "#11190c" }}>Saldo em conta</span>
          </div>
          {/* Herói: o SALDO consolidado. Roobert Variable 35/500 tracking
              −0.055em; o prefixo R$ e os centavos vêm de `a4p-heroi`. O sufixo
              traz o resultado do período (entradas − saídas). */}
          <div className="flex items-baseline gap-2 mt-2 flex-wrap">
            {/* ⚠️ SEM `Math.abs`. O herói exibia o saldo em módulo, então um
                caixa de −R$ 31.000,16 aparecia como +R$ 31.000,16: a informação
                mais importante da tela, com o sinal trocado. Um saldo negativo
                é a coisa que a pessoa PRECISA ver — ele entra com o sinal e em
                `negative`. */}
            <span
              className="a4p-heroi text-[30px] tabular-nums leading-none"
              style={{ fontFamily: VARIAVEL, fontWeight: 400, color: saldo < 0 ? "var(--color-negative)" : "var(--color-ink)" }}
            >
              {saldo < 0 && <span aria-hidden>−</span>}
              <AnimatedBRL value={Math.abs(saldo)} />
            </span>
            <span className="text-[14px]" style={{ fontFamily: VARIAVEL, fontWeight: 200, letterSpacing: "-0.005em", color: "#CAC4B7" }}>
              {positivoNoPeriodo ? "+" : "−"}{formatBRL(Math.abs(calc.resultado))} {sufixo}
            </span>
          </div>

          <div className="relative mt-4" ref={boxRef}>
            <figure className="m-0" role="img" aria-label={`Saldo em conta ${formatBRL(saldo)}. No período${mesNome ? " de " + mesNome : ""}: entradas ${formatBRL(calc.entradas)}, saídas ${formatBRL(calc.saidas)}.`}>
              <ResponsiveContainer width="100%" height={ALTURA}>
                <ComposedChart data={calc.serie} margin={{ top: 18, right: 10, bottom: 4, left: 8 }}>
                  <defs>
                    {/* `userSpaceOnUse` de propósito: em `objectBoundingBox` (o
                        padrão) o SVG NÃO desenha o gradiente quando a bbox tem
                        largura ou altura zero — e uma série achatada some.
                        Por isso ancoramos nas dimensões reais do gráfico. */}
                    <linearGradient id="visorEnt" gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={largura} y2={0}>
                      <stop offset="0%" stopColor={POSITIVE} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={POSITIVE} stopOpacity={1} />
                    </linearGradient>
                    <linearGradient id="visorSai" gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={largura} y2={0}>
                      <stop offset="0%" stopColor={NEGATIVE} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={NEGATIVE} stopOpacity={1} />
                    </linearGradient>
                    <linearGradient id="visorFillEnt" gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={0} y2={ALTURA}>
                      <stop offset="0%" stopColor={POSITIVE} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={POSITIVE} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="visorFillSai" gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={0} y2={ALTURA}>
                      <stop offset="0%" stopColor={NEGATIVE} stopOpacity={0.18} />
                      <stop offset="100%" stopColor={NEGATIVE} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" hide />
                  <YAxis hide domain={[0, "auto"]} />
                  <Tooltip content={<GastoTooltip />} cursor={{ stroke: "#c9cdd4", strokeDasharray: "3 3" }} />
                  <Area type="monotone" dataKey="ent" stroke="none" fill="url(#visorFillEnt)" {...chartAnim()} />
                  <Area type="monotone" dataKey="sai" stroke="none" fill="url(#visorFillSai)" {...chartAnim(120)} />
                  {/* ENTRADAS — verde em gradiente */}
                  <Line type="monotone" dataKey="ent" stroke="url(#visorEnt)" strokeWidth={2.9} strokeLinecap="round" strokeLinejoin="round" dot={false} activeDot={{ r: 5, fill: POSITIVE, stroke: "#fff", strokeWidth: 2 }} {...chartAnim()} />
                  {/* SAÍDAS — vermelho em gradiente */}
                  <Line type="monotone" dataKey="sai" stroke="url(#visorSai)" strokeWidth={2.9} strokeLinecap="round" strokeLinejoin="round" dot={false} activeDot={{ r: 5, fill: NEGATIVE, stroke: "#fff", strokeWidth: 2 }} {...chartAnim(120)} />
                </ComposedChart>
              </ResponsiveContainer>
            </figure>
            <div className="flex items-center gap-4 mt-1 text-[13px] text-muted">
              <span className="inline-flex items-center gap-[6px]"><span className="w-2 h-2 rounded-pill" style={{ background: POSITIVE }} />Entradas</span>
              <span className="inline-flex items-center gap-[6px]"><span className="w-2 h-2 rounded-pill" style={{ background: NEGATIVE }} />Saídas</span>
            </div>
          </div>
        </Card>

        <DicaCard insight={calc.insight} sufixo={sufixo} onOpen={() => router.push("/dre")} />
      </div>

      {/* DIREITA — Distribuição (donut + legenda rica) */}
      <Card className="flex flex-col">
        <div className="flex items-start justify-between gap-3">
          {/* Título + o PERÍODO ativo: este box segue a mesma janela do gráfico
              ao lado (mês ou semana), então o rótulo diz qual é. */}
          <span className="flex flex-col gap-[2px] min-w-0">
          <span className="inline-flex items-center gap-3 text-[17px] text-ink" style={{ fontFamily: VARIAVEL, fontWeight: 400, letterSpacing: "-0.02em" }}>
            {tipoDist === "saida" ? "Distribuição dos gastos" : "Distribuição das entradas"}
            <InfoHint align="left"
              oQue="Para onde foi (ou de onde veio) o dinheiro no período, por categoria."
              comoCalcula="Soma dos lançamentos do período por categoria; o % é a fatia de cada uma no total. A tendência ▲/▼ compara com o mês anterior." />
          </span>
          <span className="text-[13px] text-faint truncate">{period.label}</span>
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
                      {/* Tipografia da legenda (Laboratório): Roobert Semi Mono
                          nas TRÊS colunas — nome 13/800, % 12/900, valor 600. */}
                      <span className="text-[14px] text-ink truncate" style={{ fontFamily: VARIAVEL }}>{s.name}</span>
                      <span className="text-[12px] text-muted bg-surface-2 rounded-pill px-2 py-[1px] shrink-0" style={{ fontFamily: SEMI_MONO, fontVariantNumeric: "tabular-nums", fontWeight: 900 }}>{pct.toLocaleString("pt-BR")}%</span>
                      <span className="flex-1" />
                      <span className="text-[15px] tabular-nums text-ink shrink-0 whitespace-nowrap" style={{ fontFamily: SEMI_MONO, fontWeight: 600 }}>{brlNoCents(s.value)}</span>
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
    // Degradê da marca INVERTIDO (`--gradient-marca-inv`): mesmos stops do FAB
    // "All 4 Pay AI", de baixo para cima.
    // Sobre lima tudo entra em `on-lime` — texto claro aqui seria ilegível; os
    // controles viram vidro escuro para não sumirem no fundo.
    <Card className="flex flex-col gap-3" style={{ background: "var(--gradient-marca-inv)" }}>
      <div className="flex items-center gap-3">
        {/* O tile do sparkle saiu (Laboratório). Título e texto em Roobert
            Variable nos cinzas escolhidos — vide a ressalva de contraste no PR. */}
        <span className="text-[17px]" style={{ fontFamily: VARIAVEL, fontWeight: 500, letterSpacing: "-0.02em", color: "#5c5c5c" }}>Dica all4pay</span>
        <button onClick={onOpen} aria-label="Abrir detalhe" className="ml-auto w-7 h-7 rounded-pill inline-flex items-center justify-center text-on-lime hover:bg-black/10 transition-colors">
          <Icon name="arrow-up-right" size={16} color="currentColor" />
        </button>
      </div>
      <p className="m-0 text-[14px] leading-snug min-h-[44px]" style={{ fontFamily: VARIAVEL, fontWeight: 400, color: "#a3a3a3" }}>{dicas[i]}</p>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-[6px] flex-1">
          {dicas.map((_, k) => (
            <span key={k} className="h-[6px] rounded-pill transition-all" style={{ width: k === i ? 20 : 6, background: k === i ? "#11190C" : "rgba(17,25,12,0.25)" }} />
          ))}
        </div>
        <button onClick={() => go(-1)} aria-label="Dica anterior" className="w-8 h-8 rounded-pill inline-flex items-center justify-center bg-black/10 text-on-lime hover:bg-black/20 transition-colors">
          <Icon name="chevron-left" size={16} color="currentColor" />
        </button>
        <button onClick={() => go(1)} aria-label="Próxima dica" className="w-8 h-8 rounded-pill inline-flex items-center justify-center bg-black/10 text-on-lime hover:bg-black/20 transition-colors">
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
        {/* Centro do donut (Laboratório): rótulo e valor em Roobert Semi Mono —
            o valor em 18/400 com tracking −0.045em. */}
        <span className="text-[14px] text-muted leading-tight truncate max-w-full" style={{ fontFamily: VARIAVEL, fontWeight: 300, letterSpacing: "-0.02em" }}>{sel ? sel.name : centerLabel}</span>
        <span className="text-[18px] leading-none mt-[5px] whitespace-nowrap text-ink" style={{ fontFamily: VARIAVEL, fontWeight: 400, fontVariantNumeric: "tabular-nums" }} title={formatBRL(sel ? sel.value : total)}>
          {brlNoCents(sel ? sel.value : total)}
        </span>
      </div>
    </div>
  );
}

function GastoTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload as Ponto | undefined;
  if (!p) return null;
  return (
    <div className="bg-white rounded-card border border-border shadow-popover px-3 py-[10px] text-caption min-w-[190px]">
      <div className="font-medium text-ink mb-[6px]">{p.label}</div>
      <TipRow color={POSITIVE} k="Entradas" v={brlNoCents(p.ent)} />
      <TipRow color={NEGATIVE} k="Saídas" v={brlNoCents(p.sai)} />
      <TipRow color="var(--color-ink)" k="Resultado" v={brlNoCents(p.ent - p.sai)} />
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

