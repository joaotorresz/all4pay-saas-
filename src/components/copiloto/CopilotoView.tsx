"use client";

import * as React from "react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { BRL, Card, Skeleton, Icon } from "@/components/ui";
import { formatBRL, formatBRLCompact } from "@/lib/format";
import { useCentroInteligencia } from "@/components/visao-geral/hooks";
import { simularCenario } from "@/core/executive";
import type { ScenarioInput, Severidade } from "@/core/executive/types";
import { AcoesCopiloto } from "./AcoesCopiloto";
import { CopilotoChat } from "./CopilotoChat";
import Link from "next/link";

const DRILLDOWNS: { href: string; label: string }[] = [
  { href: "/decisao", label: "Decisão" },
  { href: "/autonomo", label: "Autônomo" },
  { href: "/risco", label: "Risco" },
  { href: "/inadimplencia", label: "Inadimplência" },
  { href: "/inteligencia", label: "Inteligência" },
  { href: "/dados", label: "Dados" },
];

const SEV_COR: Record<Severidade, string> = {
  baixa: "var(--color-text-secondary)",
  media: "var(--color-warning)",
  alta: "var(--color-negative)",
  critica: "var(--color-negative)",
};

export function CopilotoView() {
  const { data, isLoading, isError } = useCentroInteligencia();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Skeleton className="h-[280px] lg:col-span-2" rounded="card" />
        <Skeleton className="h-[280px] lg:col-span-1" rounded="card" />
        <Skeleton className="h-[240px] lg:col-span-3" rounded="card" />
      </div>
    );
  }
  if (isError || !data) {
    return <Card><p className="text-muted">Não foi possível montar o centro de inteligência.</p></Card>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start pb-4">
      <div className="lg:col-span-3 flex items-center gap-x-3 gap-y-1 flex-wrap text-caption text-faint">
        <span className="text-muted">O Copiloto centraliza a inteligência e <b className="font-medium text-ink">age</b>. Detalhamentos:</span>
        {DRILLDOWNS.map((d) => (
          <Link key={d.href} href={d.href} className="text-muted hover:text-ink underline">{d.label}</Link>
        ))}
      </div>
      <AcoesCopiloto />
      <CopilotoChat ctx={data.context} />
      <BriefingCard b={data.briefing} />
      <InsightsCard insights={data.insights} />
      <AnomaliasCard anomalias={data.anomalias} />
      <ForecastCard forecast={data.forecast} />
      <SimuladorCard indic={data.indicadores} saldo={data.context.saldoAtual} score={data.context.scoreFinanceiro} />
      <MemoriaCard memoria={data.memoria} />
    </div>
  );
}

/* ---------- Briefing ---------- */
function BriefingCard({ b }: { b: import("@/core/executive/types").Briefing }) {
  const cor = b.riscoRuptura === "elevado" ? "var(--color-negative)" : b.riscoRuptura === "moderado" ? "var(--color-warning)" : "var(--color-positive)";
  return (
    <Card className="lg:col-span-1 flex flex-col gap-3">
      <span className="text-label font-medium text-muted">Briefing executivo · {b.data}</span>
      <div className="flex gap-6">
        <div>
          <div className="text-caption text-faint">Saldo</div>
          <div className="text-h3 font-medium tabular-nums text-ink"><BRL value={b.saldo} /></div>
        </div>
        <div>
          <div className="text-caption text-faint">Runway</div>
          <div className="text-h3 font-medium tabular-nums text-ink">{b.runway}m</div>
        </div>
      </div>
      {b.alertas.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-caption font-medium text-faint tracking-wide">Alertas</span>
          {b.alertas.map((a, i) => (
            <span key={i} className="inline-flex items-start gap-[6px] text-caption text-muted">
              <span className="w-[6px] h-[6px] rounded-pill bg-negative mt-[6px]" />{a}
            </span>
          ))}
        </div>
      )}
      {b.oportunidades.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-caption font-medium text-faint tracking-wide">Oportunidades</span>
          {b.oportunidades.map((o, i) => (
            <span key={i} className="inline-flex items-start gap-[6px] text-caption text-muted">
              <span className="w-[6px] h-[6px] rounded-pill bg-positive mt-[6px]" />{o}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between pt-1 border-t border-border-soft">
        <span className="text-caption text-faint">Risco de ruptura</span>
        <span className="text-label font-medium" style={{ color: cor }}>{b.riscoRuptura}</span>
      </div>
    </Card>
  );
}

/* ---------- Insights ---------- */
function InsightsCard({ insights }: { insights: import("@/core/executive/types").ExecutiveInsight[] }) {
  return (
    <Card className="lg:col-span-2 flex flex-col gap-3">
      <span className="text-label font-medium text-muted">Insights priorizados · impacto × urgência</span>
      {insights.length === 0 && <span className="text-caption text-faint">Nenhum insight relevante no momento.</span>}
      <div className="flex flex-col">
        {insights.map((i) => (
          <div key={i.id} className="flex gap-3 py-[10px] border-t border-border-soft first:border-t-0">
            <span className="text-caption font-medium text-faint tabular-nums w-[20px] pt-[2px]">#{i.prioridade}</span>
            <span className="w-2 h-2 rounded-pill mt-[6px] shrink-0" style={{ background: SEV_COR[i.severidade] }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[17px] font-medium text-ink">{i.titulo}</span>
                {i.impactoCentavos > 0 && (
                  <span className="text-caption text-muted tabular-nums shrink-0"><BRL value={i.impactoCentavos / 100} /></span>
                )}
              </div>
              <span className="text-caption text-muted">{i.descricao}</span>
              <div className="flex flex-wrap gap-2 mt-1">
                {i.recomendacoes.map((r, j) => (
                  <span key={j} className="text-caption text-faint bg-surface-2 rounded-pill px-2 py-[2px]">{r}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ---------- Anomalias ---------- */
function AnomaliasCard({ anomalias }: { anomalias: import("@/core/executive/types").Anomalia[] }) {
  return (
    <Card className="lg:col-span-1 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Icon name="triangle-alert" size={16} color="var(--color-text-secondary)" />
        <span className="text-label font-medium text-muted">Anomalias</span>
      </div>
      {anomalias.length === 0 ? (
        <span className="text-caption text-faint">Nenhuma anomalia detectada — despesas e pagamentos dentro do padrão histórico.</span>
      ) : (
        anomalias.map((a) => (
          <div key={a.id} className="flex flex-col gap-1 rounded-md border border-border-soft p-3">
            <span className="inline-flex items-center gap-[6px] text-label font-medium" style={{ color: SEV_COR[a.severidade] }}>
              <span className="w-2 h-2 rounded-pill" style={{ background: SEV_COR[a.severidade] }} />{a.titulo}
            </span>
            <span className="text-caption text-muted">{a.descricao}</span>
            <span className="text-caption text-faint tabular-nums"><BRL value={a.valor} /></span>
          </div>
        ))
      )}
    </Card>
  );
}

/* ---------- Forecast ---------- */
function ForecastCard({ forecast }: { forecast: import("@/core/executive/types").Forecast }) {
  return (
    <Card className="lg:col-span-2 flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-label font-medium text-muted">Motor preditivo · fluxo líquido</span>
        {forecast.janelaPressao && (
          <span className="text-caption font-medium text-warning">Pressão em {forecast.janelaPressao.mes}</span>
        )}
      </div>
      <div role="img" aria-label={forecast.texto}>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={forecast.serie} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="var(--color-border-soft)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 13, fill: "var(--color-text-tertiary)" }} tickLine={false} axisLine={{ stroke: "var(--color-border-soft)" }} />
            <YAxis tick={{ fontSize: 13, fill: "var(--color-text-tertiary)" }} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => formatBRLCompact(v)} />
            <ReferenceLine y={0} stroke="var(--color-border)" />
            <Tooltip
              cursor={{ fill: "rgba(0,0,0,0.03)" }}
              content={({ active, payload, label }: any) =>
                active && payload?.length ? (
                  <div className="bg-white rounded-card border border-border shadow-popover px-3 py-[10px] text-caption">
                    <div className="font-medium text-ink mb-1">{label} {payload[0].payload.tipo === "previsto" && "(previsto)"}</div>
                    <div className="text-muted tabular-nums"><BRL value={payload[0].value} /></div>
                  </div>
                ) : null
              }
            />
            <Bar dataKey="valor" radius={[3, 3, 0, 0]}>
              {forecast.serie.map((p, i) => (
                <Cell key={i} fill={p.tipo === "previsto" ? "var(--color-border)" : "var(--color-ink)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <span className="text-caption text-faint">{forecast.texto}</span>
    </Card>
  );
}

/* ---------- Simulador ---------- */
function SimuladorCard({ indic, saldo, score }: { indic: import("@/core/quant/types").IndicadoresFinanceiros; saldo: number; score: number }) {
  const [sc, setSc] = React.useState<ScenarioInput>({ receitaDelta: 0, despesaDelta: 0, inadimplenciaDelta: 0 });
  const r = React.useMemo(() => simularCenario(indic, saldo, sc), [indic, saldo, sc]);
  const deltaScore = r.scoreProjetado - score;

  return (
    <Card className="lg:col-span-1 flex flex-col gap-3">
      <span className="text-label font-medium text-muted">Simulador de cenários</span>
      <Slider label="Receita" value={sc.receitaDelta ?? 0} min={-0.5} max={0.5} onChange={(v) => setSc((s) => ({ ...s, receitaDelta: v }))} />
      <Slider label="Despesa" value={sc.despesaDelta ?? 0} min={-0.3} max={0.5} onChange={(v) => setSc((s) => ({ ...s, despesaDelta: v }))} />
      <Slider label="Inadimplência" value={sc.inadimplenciaDelta ?? 0} min={0} max={0.3} step={0.01} suffix="pp" onChange={(v) => setSc((s) => ({ ...s, inadimplenciaDelta: v }))} />

      <div className="rounded-md bg-surface-1 p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-caption text-faint">Score projetado</span>
          <span className="text-h3 font-medium tabular-nums" style={{ color: deltaScore < 0 ? "var(--color-negative)" : "var(--color-positive)" }}>
            {r.scoreProjetado} {deltaScore !== 0 && <span className="text-label">({deltaScore > 0 ? "+" : ""}{deltaScore})</span>}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-caption text-faint">Runway</span>
          <span className="text-label font-medium tabular-nums text-ink">{r.runwayMeses}m</span>
        </div>
        <p className="m-0 text-caption text-muted">{r.texto}</p>
      </div>
    </Card>
  );
}

function Slider({ label, value, min, max, step = 0.01, suffix = "%", onChange }: {
  label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (v: number) => void;
}) {
  const disp = suffix === "pp" ? `+${Math.round(value * 100)}pp` : `${value > 0 ? "+" : ""}${Math.round(value * 100)}%`;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-label text-muted">{label}</span>
        <span className="text-label font-medium tabular-nums text-ink">{disp}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 cursor-pointer"
        style={{ accentColor: "var(--color-ink)" }}
      />
    </div>
  );
}

/* ---------- Memória ---------- */
function MemoriaCard({ memoria }: { memoria: import("@/core/executive/types").PadraoMemoria[] }) {
  if (memoria.length === 0) return null;
  return (
    <Card className="lg:col-span-3 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Icon name="activity" size={16} color="var(--color-text-secondary)" />
        <span className="text-label font-medium text-muted">Memória da operação · padrões aprendidos</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {memoria.map((m, i) => (
          <div key={i} className="rounded-md border border-border-soft p-3">
            <span className="text-caption font-medium text-faint tracking-wide">{m.tipo}</span>
            <p className="m-0 text-caption text-muted mt-1">{m.texto}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
