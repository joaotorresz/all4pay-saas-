"use client";

import * as React from "react";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  LineChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { BRL, Card, Skeleton, Icon } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import { isDemo } from "@/lib/demo";
import { useQuantitativo } from "@/components/visao-geral/hooks";
import {
  CLASSIF_SAUDE_LABEL,
  type ClassificacaoSaude,
  type IndicadoresFinanceiros,
  type BenchmarkLinha,
} from "@/core/quant/types";
import { chartAnim } from "@/lib/chart-anim";
import { pctDeInteiro } from "@/lib/format";

const COR: Record<ClassificacaoSaude, string> = {
  excelente: "var(--color-positive)",
  saudavel: "var(--color-positive)",
  atencao: "var(--color-warning)",
  risco: "var(--color-negative)",
  critico: "var(--color-negative)",
};
const TEND: Record<string, { label: string; cor: string; icon: string }> = {
  melhorando: { label: "Melhorando", cor: "var(--color-positive)", icon: "arrow-up" },
  estavel: { label: "Estável", cor: "var(--color-text-secondary)", icon: "arrow-left-right" },
  piorando: { label: "Piorando", cor: "var(--color-negative)", icon: "arrow-down-to-line" },
};
const pct = (n: number) => `${(n * 100).toFixed(n < 0.1 && n > 0 ? 1 : 0)}%`;

export function QuantView() {
  const { data, isLoading, isError } = useQuantitativo();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Skeleton className="h-[260px] lg:col-span-1" rounded="card" />
        <Skeleton className="h-[260px] lg:col-span-2" rounded="card" />
        <Skeleton className="h-[200px] lg:col-span-3" rounded="card" />
      </div>
    );
  }
  if (isError || !data) {
    return <Card><p className="text-muted">Não foi possível calcular os indicadores.</p></Card>;
  }

  const { score, indicadores: i, radar, scoreTemporal, cenarios, benchmark } = data;
  const tend = TEND[score.tendencia];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start pb-4">
      {/* Score de saúde */}
      <Card
        className="lg:col-span-1 flex flex-col gap-4"
        info={{
          titulo: "Score de saúde financeira",
          oQue: "Uma nota de 0 a 100 para a saúde do negócio, com a tendência e a chance de ruptura em 90 dias.",
          comoCalcula: "Pondera liquidez, runway, inadimplência, margem, volatilidade, concentração e crescimento em um score único.",
        }}
      >
        <span className="text-label font-medium text-muted">Score de saúde financeira</span>
        <div className="flex items-end gap-3">
          <span className="text-[62px] leading-none font-medium tabular-nums" style={{ color: COR[score.classificacao] }}>
            {score.score}
          </span>
          <span className="text-h3 text-faint mb-1">/100</span>
        </div>
        <span
          className="self-start inline-flex items-center gap-2 rounded-pill px-3 py-1 text-label font-medium"
          style={{ background: "var(--color-surface-2)", color: COR[score.classificacao] }}
        >
          <span className="w-2 h-2 rounded-pill" style={{ background: COR[score.classificacao] }} />
          {CLASSIF_SAUDE_LABEL[score.classificacao]}
        </span>
        <div className="h-2 rounded-pill bg-surface-2 overflow-hidden">
          <div className="h-full rounded-pill" style={{ width: `${score.score}%`, background: COR[score.classificacao] }} />
        </div>
        <div className="flex items-center justify-between pt-1">
          <span className="inline-flex items-center gap-[6px] text-label" style={{ color: tend.cor }}>
            <Icon name={tend.icon} size={14} color={tend.cor} />
            {tend.label}
          </span>
          <div className="text-right">
            <div className="text-caption text-faint">Prob. ruptura (90d)</div>
            <div className="text-h3 font-medium tabular-nums text-ink">{pct(score.probabilidadeRuptura)}</div>
          </div>
        </div>
      </Card>

      {/* Radar executivo */}
      <Card
        className="lg:col-span-2 flex flex-col gap-2"
        info={{
          titulo: "Radar executivo",
          oQue: "Mostra de relance a empresa em 7 dimensões — quanto mais cheio o radar, mais saudável.",
          comoCalcula: "Cada dimensão é normalizada de 0 a 100 a partir dos indicadores e desenhada como um eixo do radar.",
        }}
      >
        <span className="text-label font-medium text-muted">Radar executivo</span>
        <div role="img" aria-label={`Radar: ${radar.map((d) => `${d.dimensao} ${d.valor}`).join(", ")}`}>
          <ResponsiveContainer width="100%" height={240}>
            <RadarChart data={radar} outerRadius="78%">
              <PolarGrid stroke="var(--color-border-soft)" />
              <PolarAngleAxis dataKey="dimensao" tick={{ fontSize: 13, fill: "var(--color-text-secondary)" }} />
              <Radar dataKey="valor" stroke="var(--color-ink)" fill="var(--color-ink)" fillOpacity={0.08} strokeWidth={1.4} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Narrativa executiva (CFO digital) */}
      <Card
        className="lg:col-span-3 flex flex-col gap-3"
        info={{
          titulo: "CFO digital",
          oQue: "Lê os números do negócio e explica em texto, como faria um CFO, o que está bom, o que preocupa e o que priorizar.",
          comoCalcula: "A IA financeira interpreta os indicadores e o score de forma determinística e monta a leitura executiva.",
        }}
      >
        <div className="flex items-center gap-2">
          <span className="w-[26px] h-[26px] rounded-sm bg-lime inline-flex items-center justify-center">
            <Icon name="sparkles" size={14} color="var(--color-on-lime)" />
          </span>
          <span className="text-label font-medium text-muted">CFO digital · interpretação executiva</span>
        </div>
        <p className="m-0 text-h3 leading-[1.5] font-regular text-ink">{data.narrativa}</p>
      </Card>

      {/* KPIs institucionais */}
      <Card
        className="lg:col-span-3 flex flex-col gap-3"
        info={{
          titulo: "Indicadores institucionais",
          oQue: "O painel de KPIs do negócio: liquidez, runway, burn, margens, crescimento, ticket, inadimplência e mais.",
          comoCalcula: "Cada indicador é calculado a partir dos lançamentos e da série mensal, no padrão usado por análise financeira institucional.",
        }}
      >
        <span className="text-label font-medium text-muted">Indicadores institucionais</span>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-5 gap-y-4">
          <Kpi label="Liquidez corrente" value={liq(i.liquidezCorrente)} />
          <Kpi label="Runway" value={`${i.runwayMeses}m`} />
          <Kpi label="Burn / mês" value={i.burnRate > 0 ? <BRL value={i.burnRate} /> : "—"} />
          <Kpi label="Burn multiple" value={i.burnRate > 0 ? `${i.burnMultiple}x` : "—"} />
          <Kpi label="Margem de caixa (90d)" value={pct(i.margemCaixa90d)} />
          <Kpi label="Eficiência de caixa" value={pct(i.eficienciaDeCaixa)} />
          <Kpi label="Eficiência op." value={`${i.eficienciaOperacional.toFixed(1)}/10`} />
          <Kpi label="ROIC (proxy)" value={pct(i.roic)} />
          <Kpi label="Crescimento MoM" value={pct(i.crescimentoMensal)} tone={i.crescimentoMensal < 0 ? "var(--color-negative)" : undefined} />
          <Kpi label="Receita recorrente" value={pct(i.receitaRecorrente)} />
          <Kpi label="Inadimplência" value={pct(i.inadimplencia)} tone={i.inadimplencia > 0.15 ? "var(--color-negative)" : undefined} />
          <Kpi label="Concentração" value={pct(i.concentracaoReceita)} tone={i.concentracaoReceita > 0.4 ? "var(--color-warning)" : undefined} />
          <Kpi label="Dependência (top 2)" value={pct(i.dependenciaCliente)} />
          <Kpi label="Ticket médio" value={<BRL value={i.ticketMedio} />} />
          <Kpi label="Qualidade da receita" value={`${i.qualidadeReceita}/100`} />
          <Kpi label="Volatilidade" value={VOL_LABEL[i.volatilidadeNivel]} />
        </div>
      </Card>

      {/* Score temporal */}
      <Card
        className="lg:col-span-2 flex flex-col gap-2"
        info={{
          titulo: "Evolução do score",
          oQue: "Acompanha como o score de saúde se moveu mês a mês, para ver se a empresa está melhorando ou piorando.",
          comoCalcula: "O score de saúde é recalculado para cada mês da série e desenhado ao longo do tempo.",
        }}
      >
        <span className="text-label font-medium text-muted">Evolução do score</span>
        <div role="img" aria-label={`Evolução do score: ${scoreTemporal.map((m) => `${m.label} ${m.score}`).join(", ")}`}>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={scoreTemporal} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <defs>
                <linearGradient id="quantGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-lime)" stopOpacity={0.28} />
                  <stop offset="70%" stopColor="var(--color-lime)" stopOpacity={0.05} />
                  <stop offset="100%" stopColor="var(--color-lime)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--color-border-soft)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 13, fill: "var(--color-text-tertiary)" }} tickLine={false} axisLine={{ stroke: "var(--color-border-soft)" }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 13, fill: "var(--color-text-tertiary)" }} tickLine={false} axisLine={false} width={32} />
              <Tooltip
                cursor={{ stroke: "var(--color-border)" }}
                content={({ active, payload, label }: any) =>
                  active && payload?.length ? (
                    <div className="bg-white rounded-card border border-border shadow-popover px-3 py-[10px] text-caption">
                      <div className="font-medium text-ink mb-1">{label}</div>
                      <div className="text-muted tabular-nums">Score {payload[0].value}</div>
                    </div>
                  ) : null
                }
              />
              <Area type="monotone" dataKey="score" stroke="none" fill="url(#quantGlow)" {...chartAnim()} />
              <Line type="monotone" dataKey="score" stroke="var(--color-chart-line)" strokeWidth={1.4} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Cenários preditivos */}
      <Card
        className="lg:col-span-1 flex flex-col gap-3"
        info={{
          titulo: "Score preditivo · cenários",
          oQue: "Mostra como o score ficaria sob choques de receita, despesa ou inadimplência, e em quanto tempo.",
          comoCalcula: "Cada cenário aplica o choque sobre os indicadores e recalcula o score projetado, exibindo a variação.",
        }}
      >
        <span className="text-label font-medium text-muted">Score preditivo · cenários</span>
        {cenarios.map((c) => (
          <div key={c.id} className="rounded-md border border-border-soft p-3 flex flex-col gap-1">
            <div className="flex items-baseline justify-between">
              <span className="text-[17px] font-medium text-ink">{c.label}</span>
              <span className="text-label tabular-nums" style={{ color: c.delta < 0 ? "var(--color-negative)" : "var(--color-positive)" }}>
                {c.scoreProjetado} {c.delta !== 0 && `(${c.delta > 0 ? "+" : ""}${c.delta})`}
              </span>
            </div>
            <span className="text-caption text-faint">{c.descricao} · em {c.emDias} dias</span>
          </div>
        ))}
      </Card>

      {/* Benchmark setorial */}
      <Card
        className="lg:col-span-3 flex flex-col gap-3"
        info={{
          titulo: "Benchmark setorial",
          oQue: "Compara seus números (margem, eficiência, inadimplência, crescimento) com a mediana do setor.",
          comoCalcula: "Cada métrica da empresa é confrontada com a referência setorial e marcada como acima ou abaixo da média.",
        }}
      >
        <span className="text-label font-medium text-muted">Benchmark setorial</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {benchmark.map((b) => (
            <BenchCard key={b.metrica} b={b} />
          ))}
        </div>
        {isDemo && (
          <span className="text-caption text-faint">
            Medianas setoriais ilustrativas — benchmark anonimizado real exige a base cross-tenant conectada.
          </span>
        )}
      </Card>
    </div>
  );
}

const VOL_LABEL: Record<string, string> = {
  alta_previsibilidade: "Previsível",
  moderada: "Moderada",
  alta_volatilidade: "Volátil",
};

function liq(v: number) {
  return v >= 10 ? "10+" : v.toFixed(2);
}

function Kpi({ label, value, tone = "var(--color-ink)" }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="flex flex-col gap-[2px]">
      <span className="text-caption text-faint">{label}</span>
      <span className="text-h3 font-medium tabular-nums" style={{ color: tone }}>{value}</span>
    </div>
  );
}

function benchFmt(v: number, u: BenchmarkLinha["unidade"]) {
  return u === "pct" ? `${pctDeInteiro((v * 100))}` : u === "x" ? `${v.toFixed(1)}x` : v.toFixed(1);
}

function BenchCard({ b }: { b: BenchmarkLinha }) {
  const cor = b.acima ? "var(--color-positive)" : "var(--color-negative)";
  return (
    <div className="rounded-md border border-border-soft p-3 flex flex-col gap-1">
      <span className="text-caption text-faint">{b.metrica}</span>
      <div className="flex items-baseline gap-2">
        <span className="text-value-lg leading-none font-medium tabular-nums" style={{ color: cor }}>
          {benchFmt(b.empresa, b.unidade)}
        </span>
        <span className="text-caption text-muted">vs {benchFmt(b.setor, b.unidade)} setor</span>
      </div>
      <span className="text-caption" style={{ color: cor }}>
        {b.acima ? "Acima da média setorial" : "Abaixo da média setorial"}
      </span>
    </div>
  );
}
