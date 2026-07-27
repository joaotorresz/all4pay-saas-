"use client";

/**
 * PILOTO — fluxo de caixa diário em **TradingView Lightweight Charts**.
 *
 * Por que só aqui: a lib é de SÉRIE TEMPORAL (canvas). Ela é ótima para este
 * gráfico (crosshair, zoom/pan, milhares de pontos sem engasgar), mas NÃO faz
 * radar nem eixo categórico — então os demais gráficos seguem em Recharts.
 * Este arquivo é isolado de propósito: trocar de volta é trocar um import.
 *
 * Desenho: entradas (histograma positivo) + saídas (histograma negativo) numa
 * escala, saldo acumulado (linha) em outra — sólido no realizado, tracejado no
 * projetado. Cores/fonte vêm dos TOKENS do DS lidos em runtime, e o gráfico se
 * repinta ao trocar de tema (MutationObserver na classe do <html>).
 */
import * as React from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { DailyCashflowPoint } from "@/lib/types";
import { BRL } from "@/components/ui";

type Filtro = "todos" | "entrada" | "saida";

/** Lê um token do DS já resolvido (a lib precisa de cor concreta, não de var()). */
function token(el: Element, nome: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(nome).trim();
  return v || fallback;
}

/** ISO "2026-07-14" → timestamp UTC do meio-dia (evita virar o dia em UTC-3). */
function isoParaTime(iso: string): UTCTimestamp {
  return (Date.parse(`${iso}T12:00:00Z`) / 1000) as UTCTimestamp;
}

export function DailyCashflowLW({
  data,
  filtro,
  hojeISO,
  altura = 260,
}: {
  data: DailyCashflowPoint[];
  filtro: Filtro;
  hojeISO: string;
  altura?: number;
}) {
  const box = React.useRef<HTMLDivElement | null>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const series = React.useRef<{
    entrada?: ISeriesApi<"Histogram">;
    saida?: ISeriesApi<"Histogram">;
    saldo?: ISeriesApi<"Line">;
    saldoProj?: ISeriesApi<"Line">;
  }>({});
  const [dica, setDica] = React.useState<{ x: number; ponto: DailyCashflowPoint } | null>(null);
  // Reaplica as cores quando o tema inverte.
  const [tema, setTema] = React.useState(0);

  const porDia = React.useMemo(() => {
    const m = new Map<number, DailyCashflowPoint>();
    for (const d of data) m.set(isoParaTime(d.date), d);
    return m;
  }, [data]);

  /* ---- monta o gráfico (uma vez) e repinta a cada troca de tema ---- */
  React.useEffect(() => {
    const el = box.current;
    if (!el) return;

    const ink = token(el, "--color-ink", "#11190c");
    const faint = token(el, "--color-text-tertiary", "#6b7280");
    const grid = token(el, "--color-border-soft", "#eceae4");
    const positivo = token(el, "--color-positive", "#3f6212");
    const negativo = token(el, "--color-negative", "#b42318");
    const linha = token(el, "--color-chart-line", ink);
    const fonte = getComputedStyle(el).fontFamily;

    const chart = createChart(el, {
      height: altura,
      autoSize: false,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: faint,
        fontFamily: fonte,
        fontSize: 11,
        // Atribuição exigida pela licença do TradingView (Apache-2.0 + termos).
        attributionLogo: true,
      },
      grid: { horzLines: { color: grid }, vertLines: { visible: false } },
      // Escalas ocultas: o DS mostra os números nos totais e no tooltip.
      leftPriceScale: { visible: false, scaleMargins: { top: 0.12, bottom: 0.02 } },
      rightPriceScale: { visible: false, scaleMargins: { top: 0.05, bottom: 0.35 } },
      timeScale: { borderColor: grid, fixLeftEdge: true, fixRightEdge: true },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: faint, width: 1, style: LineStyle.Dotted, labelVisible: false },
        horzLine: { visible: false, labelVisible: false },
      },
      localization: {
        locale: "pt-BR",
        priceFormatter: (p: number) =>
          p.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }),
      },
    });
    chartRef.current = chart;

    const fmt = { type: "price" as const, precision: 2, minMove: 0.01 };
    series.current.entrada = chart.addSeries(HistogramSeries, {
      color: positivo, priceScaleId: "left", priceFormat: fmt, priceLineVisible: false,
    });
    series.current.saida = chart.addSeries(HistogramSeries, {
      color: negativo, priceScaleId: "left", priceFormat: fmt, priceLineVisible: false,
    });
    series.current.saldo = chart.addSeries(LineSeries, {
      color: linha, lineWidth: 2, priceScaleId: "right", priceFormat: fmt,
      priceLineVisible: false, lastValueVisible: false, crosshairMarkerRadius: 3,
    });
    series.current.saldoProj = chart.addSeries(LineSeries, {
      color: linha, lineWidth: 2, lineStyle: LineStyle.Dashed, priceScaleId: "right",
      priceFormat: fmt, priceLineVisible: false, lastValueVisible: false, crosshairMarkerRadius: 3,
    });

    // Tooltip: o crosshair devolve o tempo; buscamos o ponto original.
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || param.point === undefined) { setDica(null); return; }
      const p = porDia.get(param.time as number);
      if (!p) { setDica(null); return; }
      setDica({ x: param.point.x, ponto: p });
    });

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height: altura });
      chart.timeScale().fitContent();
    });
    ro.observe(el);
    chart.applyOptions({ width: el.clientWidth });

    // repinta quando a classe `dark` entra/sai do <html>
    const mo = new MutationObserver(() => setTema((t) => t + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => { ro.disconnect(); mo.disconnect(); chart.remove(); chartRef.current = null; series.current = {}; };
  }, [altura, porDia, tema]);

  /* ---- alimenta as séries (dados + filtro) ---- */
  React.useEffect(() => {
    const s = series.current;
    if (!chartRef.current || !s.entrada || !s.saida || !s.saldo || !s.saldoProj) return;
    const el = box.current;
    const positivo = el ? token(el, "--color-positive", "#3f6212") : "#3f6212";
    const negativo = el ? token(el, "--color-negative", "#b42318") : "#b42318";

    const ordenado = [...data].sort((a, b) => a.date.localeCompare(b.date));
    // Dia projetado entra esmaecido (mesma leitura do gráfico anterior).
    const meio = (cor: string, proj?: boolean) => (proj ? `${cor}66` : cor);

    s.entrada.setData(
      filtro === "saida" ? [] :
        ordenado.map((d) => ({ time: isoParaTime(d.date), value: d.inflow, color: meio(positivo, d.projetado) })),
    );
    s.saida.setData(
      filtro === "entrada" ? [] :
        ordenado.map((d) => ({ time: isoParaTime(d.date), value: d.outflow, color: meio(negativo, d.projetado) })),
    );
    // Linha do saldo só no modo "todos" (igual ao comportamento anterior).
    // `whitespace` (ponto só com time) cria o corte entre realizado e projetado.
    s.saldo.setData(
      filtro !== "todos" ? [] :
        ordenado.map((d) => (d.projetado
          ? { time: isoParaTime(d.date) }
          : { time: isoParaTime(d.date), value: d.balance })),
    );
    s.saldoProj.setData(
      filtro !== "todos" ? [] :
        ordenado.map((d) => (d.projetado || d.date === hojeISO
          ? { time: isoParaTime(d.date), value: d.balance }
          : { time: isoParaTime(d.date) })),
    );
    chartRef.current.timeScale().fitContent();
  }, [data, filtro, hojeISO, tema]);

  return (
    <div className="relative">
      <div ref={box} style={{ height: altura, width: "100%" }} />
      {dica && (
        <div
          className="pointer-events-none absolute top-1 z-10 bg-white rounded-card border border-border shadow-popover px-3 py-[10px] text-caption"
          style={{ left: Math.max(0, Math.min(dica.x - 70, (box.current?.clientWidth ?? 300) - 150)) }}
        >
          <div className="font-medium text-ink mb-[6px]">
            {dica.ponto.label}{dica.ponto.projetado ? " · previsto" : ""}
          </div>
          <Linha cor="var(--color-positive)" k="Entradas" v={dica.ponto.inflow} />
          <Linha cor="var(--color-negative)" k="Saídas" v={Math.abs(dica.ponto.outflow)} />
          <Linha cor="var(--color-chart-line)" k="Saldo" v={dica.ponto.balance} />
        </div>
      )}
    </div>
  );
}

function Linha({ cor, k, v }: { cor: string; k: string; v: number }) {
  return (
    <div className="flex items-center gap-2 leading-5">
      <span className="w-2 h-2 rounded-pill shrink-0" style={{ background: cor }} />
      <span className="text-muted">{k}</span>
      <span className="ml-auto text-ink"><BRL value={v} /></span>
    </div>
  );
}
