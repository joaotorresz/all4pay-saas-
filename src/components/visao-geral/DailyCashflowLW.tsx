"use client";

/**
 * Fluxo de caixa diário em **TradingView Lightweight Charts**.
 *
 * Dois modos:
 *  · "barras" — entradas/saídas como histogramas divergentes + linha de saldo.
 *  · "velas"  — CANDLESTICK do SALDO EM CAIXA. Não existe OHLC de caixa, então
 *    derivamos um que é financeiramente honesto:
 *        abertura = saldo no fim do dia anterior
 *        fechamento = saldo no fim do dia
 *        máxima  = abertura + entradas  (pico, se tudo entrasse antes de sair)
 *        mínima  = abertura + saídas    (fundo, se tudo saísse antes de entrar)
 *    Ou seja: o corpo é o RESULTADO do dia (verde fecha acima, vermelho abaixo)
 *    e os pavios são a FAIXA que o caixa percorreu conforme a ordem dos
 *    lançamentos. As invariantes de candle valem por construção, porque
 *    fechamento = abertura + entradas + saídas.
 *
 * A lib é de série temporal em canvas: não faz radar nem eixo categórico, então
 * os demais gráficos do app seguem em Recharts. Arquivo isolado de propósito.
 */
import * as React from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  HistogramSeries,
  LineSeries,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { DailyCashflowPoint } from "@/lib/types";
import { BRL } from "@/components/ui";

type Filtro = "todos" | "entrada" | "saida";
export type ModoGrafico = "barras" | "velas";

/** OHLC do caixa derivado do saldo (vide cabeçalho). */
export interface VelaCaixa {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  ponto: DailyCashflowPoint;
}

/** Lê um token do DS já resolvido (a lib precisa de cor concreta, não de var()). */
function token(el: Element, nome: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(nome).trim();
  return v || fallback;
}

/** ISO "2026-07-14" → timestamp UTC do meio-dia (evita virar o dia em UTC-3). */
function isoParaTime(iso: string): UTCTimestamp {
  return (Date.parse(`${iso}T12:00:00Z`) / 1000) as UTCTimestamp;
}

/** Constrói as velas encadeando o saldo: abertura = fechamento do dia anterior. */
function montarVelas(data: DailyCashflowPoint[]): VelaCaixa[] {
  const ordenado = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const velas: VelaCaixa[] = [];
  let anterior: number | null = null;
  for (const d of ordenado) {
    const close = d.balance;
    // 1º dia: reconstrói a abertura tirando o movimento do próprio dia.
    const open = anterior ?? close - (d.inflow + d.outflow);
    velas.push({
      time: isoParaTime(d.date),
      open,
      close,
      high: open + d.inflow, // outflow é ≤ 0, então isto é sempre ≥ open e ≥ close
      low: open + d.outflow, // ... e isto é sempre ≤ open e ≤ close
      ponto: d,
    });
    anterior = close;
  }
  return velas;
}

export function DailyCashflowLW({
  data,
  filtro,
  hojeISO,
  altura = 260,
  modo = "barras",
}: {
  data: DailyCashflowPoint[];
  filtro: Filtro;
  hojeISO: string;
  altura?: number;
  modo?: ModoGrafico;
}) {
  const box = React.useRef<HTMLDivElement | null>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const series = React.useRef<{
    entrada?: ISeriesApi<"Histogram">;
    saida?: ISeriesApi<"Histogram">;
    saldo?: ISeriesApi<"Line">;
    saldoProj?: ISeriesApi<"Line">;
    vela?: ISeriesApi<"Candlestick">;
  }>({});
  const [dica, setDica] = React.useState<{ x: number; ponto: DailyCashflowPoint; vela?: VelaCaixa } | null>(null);
  const [tema, setTema] = React.useState(0); // reaplica cores ao inverter o tema

  const velas = React.useMemo(() => montarVelas(data), [data]);
  const porDia = React.useMemo(() => {
    const m = new Map<number, VelaCaixa>();
    for (const v of velas) m.set(v.time, v);
    return m;
  }, [velas]);

  /* ---- monta o gráfico (por modo/tema) ---- */
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
        // Atribuição exigida pela licença do TradingView.
        attributionLogo: true,
      },
      grid: { horzLines: { color: grid }, vertLines: { visible: false } },
      leftPriceScale: { visible: false, scaleMargins: { top: 0.12, bottom: 0.02 } },
      rightPriceScale: {
        visible: false,
        scaleMargins: modo === "velas" ? { top: 0.1, bottom: 0.1 } : { top: 0.05, bottom: 0.35 },
      },
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

    if (modo === "velas") {
      series.current.vela = chart.addSeries(CandlestickSeries, {
        upColor: positivo,
        downColor: negativo,
        borderVisible: false,
        wickUpColor: positivo,
        wickDownColor: negativo,
        priceScaleId: "right",
        priceFormat: fmt,
        priceLineVisible: false,
        lastValueVisible: false,
      });
    } else {
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
    }

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || param.point === undefined) { setDica(null); return; }
      const v = porDia.get(param.time as number);
      if (!v) { setDica(null); return; }
      setDica({ x: param.point.x, ponto: v.ponto, vela: v });
    });

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height: altura });
      chart.timeScale().fitContent();
    });
    ro.observe(el);
    chart.applyOptions({ width: el.clientWidth });

    const mo = new MutationObserver(() => setTema((t) => t + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => { ro.disconnect(); mo.disconnect(); chart.remove(); chartRef.current = null; series.current = {}; };
  }, [altura, porDia, tema, modo]);

  /* ---- alimenta as séries ---- */
  React.useEffect(() => {
    const s = series.current;
    if (!chartRef.current) return;
    const el = box.current;
    const positivo = el ? token(el, "--color-positive", "#3f6212") : "#3f6212";
    const negativo = el ? token(el, "--color-negative", "#b42318") : "#b42318";

    if (modo === "velas") {
      if (!s.vela) return;
      // Dia previsto entra esmaecido (mesma leitura das barras).
      s.vela.setData(
        velas.map((v) => ({
          time: v.time, open: v.open, high: v.high, low: v.low, close: v.close,
          ...(v.ponto.projetado
            ? { color: `${v.close >= v.open ? positivo : negativo}66`, wickColor: `${v.close >= v.open ? positivo : negativo}66` }
            : {}),
        })),
      );
    } else {
      if (!s.entrada || !s.saida || !s.saldo || !s.saldoProj) return;
      const ordenado = [...data].sort((a, b) => a.date.localeCompare(b.date));
      const meio = (cor: string, proj?: boolean) => (proj ? `${cor}66` : cor);
      s.entrada.setData(
        filtro === "saida" ? [] :
          ordenado.map((d) => ({ time: isoParaTime(d.date), value: d.inflow, color: meio(positivo, d.projetado) })),
      );
      s.saida.setData(
        filtro === "entrada" ? [] :
          ordenado.map((d) => ({ time: isoParaTime(d.date), value: d.outflow, color: meio(negativo, d.projetado) })),
      );
      // `whitespace` (ponto só com time) corta a série entre realizado e projetado.
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
    }
    chartRef.current.timeScale().fitContent();
  }, [data, velas, filtro, hojeISO, tema, modo]);

  return (
    <div className="relative">
      <div ref={box} style={{ height: altura, width: "100%" }} />
      {dica && (
        <div
          className="pointer-events-none absolute top-1 z-10 bg-white rounded-card border border-border shadow-popover px-3 py-[10px] text-caption min-w-[168px]"
          style={{ left: Math.max(0, Math.min(dica.x - 84, (box.current?.clientWidth ?? 300) - 172)) }}
        >
          <div className="font-medium text-ink mb-[6px]">
            {dica.ponto.label}{dica.ponto.projetado ? " · previsto" : ""}
          </div>
          {modo === "velas" && dica.vela ? (
            <>
              <Linha cor="var(--color-text-tertiary)" k="Abertura" v={dica.vela.open} />
              <Linha cor="var(--color-positive)" k="Máxima" v={dica.vela.high} />
              <Linha cor="var(--color-negative)" k="Mínima" v={dica.vela.low} />
              <Linha cor="var(--color-ink)" k="Fechamento" v={dica.vela.close} />
            </>
          ) : (
            <>
              <Linha cor="var(--color-positive)" k="Entradas" v={dica.ponto.inflow} />
              <Linha cor="var(--color-negative)" k="Saídas" v={Math.abs(dica.ponto.outflow)} />
              <Linha cor="var(--color-chart-line)" k="Saldo" v={dica.ponto.balance} />
            </>
          )}
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
