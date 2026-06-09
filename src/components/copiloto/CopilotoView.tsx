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
import { Card, Skeleton, Icon, Input, Button } from "@/components/ui";
import { formatBRL, formatBRLCompact } from "@/lib/format";
import { useCentroInteligencia } from "@/components/visao-geral/hooks";
import {
  copilotoFinanceiro,
  simularCenario,
  PERGUNTAS_SUGERIDAS,
} from "@/core/executive";
import type { RespostaCopiloto, ScenarioInput, Severidade } from "@/core/executive/types";

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
      <Copilot ctx={data.context} />
      <BriefingCard b={data.briefing} />
      <InsightsCard insights={data.insights} />
      <AnomaliasCard anomalias={data.anomalias} />
      <ForecastCard forecast={data.forecast} />
      <SimuladorCard indic={data.indicadores} saldo={data.context.saldoAtual} score={data.context.scoreFinanceiro} />
      <MemoriaCard memoria={data.memoria} />
    </div>
  );
}

/* ---------- Copiloto ---------- */
function Copilot({ ctx }: { ctx: Parameters<typeof copilotoFinanceiro>[1] }) {
  const [pergunta, setPergunta] = React.useState("");
  const [resp, setResp] = React.useState<RespostaCopiloto | null>(null);

  const perguntar = (q: string) => {
    if (!q.trim()) return;
    setPergunta(q);
    setResp(copilotoFinanceiro(q, ctx));
  };

  return (
    <Card className="lg:col-span-2 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="w-[26px] h-[26px] rounded-sm bg-lime inline-flex items-center justify-center">
          <Icon name="sparkles" size={14} color="var(--color-ink)" />
        </span>
        <span className="text-label font-medium text-muted">Copiloto financeiro</span>
      </div>

      <div className="flex gap-2">
        <Input
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && perguntar(pergunta)}
          placeholder="Pergunte sobre caixa, contratação, clientes, despesas…"
          containerClassName="flex-1"
        />
        <Button variant="primary" onClick={() => perguntar(pergunta)}>Perguntar</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {PERGUNTAS_SUGERIDAS.map((q) => (
          <button
            key={q}
            onClick={() => perguntar(q)}
            className="text-caption text-muted bg-surface-2 hover:text-ink rounded-pill px-3 py-1"
          >
            {q}
          </button>
        ))}
      </div>

      {resp && (
        <div className="rounded-md bg-surface-1 p-4 flex flex-col gap-3">
          <p className="m-0 text-body leading-[1.55] text-ink">{resp.resposta}</p>
          {resp.numeros.length > 0 && (
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {resp.numeros.map((n, i) => (
                <div key={i}>
                  <div className="text-caption text-faint">{n.label}</div>
                  <div className="text-h3 font-medium tabular-nums text-ink">{n.valor}</div>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 text-caption text-faint">
            <span>Fontes: {resp.fontes.join(" · ")}</span>
            <span className="ml-auto">confiança {Math.round(resp.confianca * 100)}%</span>
          </div>
        </div>
      )}
    </Card>
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
          <div className="text-h3 font-medium tabular-nums text-ink">{formatBRL(b.saldo)}</div>
        </div>
        <div>
          <div className="text-caption text-faint">Runway</div>
          <div className="text-h3 font-medium tabular-nums text-ink">{b.runway}m</div>
        </div>
      </div>
      {b.alertas.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-caption font-medium text-faint uppercase tracking-wide">Alertas</span>
          {b.alertas.map((a, i) => (
            <span key={i} className="inline-flex items-start gap-[6px] text-caption text-muted">
              <span className="w-[6px] h-[6px] rounded-pill bg-negative mt-[6px]" />{a}
            </span>
          ))}
        </div>
      )}
      {b.oportunidades.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-caption font-medium text-faint uppercase tracking-wide">Oportunidades</span>
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
                <span className="text-[14px] font-medium text-ink">{i.titulo}</span>
                {i.impactoCentavos > 0 && (
                  <span className="text-caption text-muted tabular-nums shrink-0">{formatBRL(i.impactoCentavos / 100)}</span>
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
            <span className="text-caption text-faint tabular-nums">{formatBRL(a.valor)}</span>
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
            <CartesianGrid stroke="#EFEFEF" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#959595" }} tickLine={false} axisLine={{ stroke: "#EFEFEF" }} />
            <YAxis tick={{ fontSize: 11, fill: "#959595" }} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => formatBRLCompact(v)} />
            <ReferenceLine y={0} stroke="#E9E9E9" />
            <Tooltip
              cursor={{ fill: "rgba(0,0,0,0.03)" }}
              content={({ active, payload, label }: any) =>
                active && payload?.length ? (
                  <div className="bg-white rounded-card border border-border shadow-popover px-3 py-[10px] text-caption">
                    <div className="font-medium text-ink mb-1">{label} {payload[0].payload.tipo === "previsto" && "(previsto)"}</div>
                    <div className="text-muted tabular-nums">{formatBRL(payload[0].value)}</div>
                  </div>
                ) : null
              }
            />
            <Bar dataKey="valor" radius={[3, 3, 0, 0]}>
              {forecast.serie.map((p, i) => (
                <Cell key={i} fill={p.tipo === "previsto" ? "#C9C9C7" : "var(--color-ink)"} />
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
            <span className="text-caption font-medium text-faint uppercase tracking-wide">{m.tipo}</span>
            <p className="m-0 text-caption text-muted mt-1">{m.texto}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
