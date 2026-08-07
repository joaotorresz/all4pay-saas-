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
import { BRL, Card, Skeleton, Icon, Button, StatusBadge, InfoHint } from "@/components/ui";
import { formatBRL, formatBRLCompact } from "@/lib/format";
import { useCentroInteligencia } from "@/components/visao-geral/hooks";
import { simularCenario } from "@/core/executive";
import type { ScenarioInput, Severidade } from "@/core/executive/types";
import { logAcaoIA } from "@/lib/ai-copilot";
import { AcoesCopiloto } from "./AcoesCopiloto";
import { CopilotoChat } from "./CopilotoChat";
import Link from "next/link";

const SEV_COR: Record<Severidade, string> = {
  baixa: "var(--color-text-secondary)",
  media: "var(--color-warning)",
  alta: "var(--color-negative)",
  critica: "var(--color-negative)",
};

export function CopilotoView() {
  const { data, isLoading, isError } = useCentroInteligencia();
  // Narrativa por LLM (grounded) do briefing/insights/anomalias — opcional.
  const [narr, setNarr] = React.useState<{ resumo?: string; itens: Record<string, string> }>({ itens: {} });
  React.useEffect(() => {
    if (!data) return;
    let vivo = true;
    (async () => {
      try {
        const cfg = await fetch("/api/ai/narrar").then((r) => r.json()).catch(() => ({ configured: false }));
        if (!cfg?.configured) return;
        const j = await fetch("/api/ai/narrar", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ contexto: data.context, briefing: data.briefing, insights: data.insights, anomalias: data.anomalias }),
        }).then((r) => r.json());
        if (!vivo || !j?.ok) return;
        const itens: Record<string, string> = {};
        for (const x of [...(j.insights ?? []), ...(j.anomalias ?? [])] as Array<{ id: string; texto: string }>) {
          if (x?.id && x?.texto) itens[x.id] = x.texto;
        }
        setNarr({ resumo: typeof j.resumo === "string" ? j.resumo : undefined, itens });
      } catch { /* fallback: textos do motor */ }
    })();
    return () => { vivo = false; };
  }, [data]);

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
      <AcoesCopiloto />
      <CopilotoChat ctx={data.context} anomalias={data.anomalias} insights={data.insights} />
      <BriefingCard b={data.briefing} resumo={narr.resumo} />
      <InsightsCard insights={data.insights} narr={narr.itens} />
      <AnomaliasCard anomalias={data.anomalias} narr={narr.itens} />
      <ForecastCard forecast={data.forecast} />
      <SimuladorCard indic={data.indicadores} saldo={data.context.saldoAtual} score={data.context.scoreFinanceiro} />
      <PlannerCard indic={data.indicadores} saldo={data.context.saldoAtual} score={data.context.scoreFinanceiro} />
      <MemoriaCard memoria={data.memoria} />
    </div>
  );
}

/* ---------- Briefing ---------- */
function BriefingCard({ b, resumo }: { b: import("@/core/executive/types").Briefing; resumo?: string }) {
  const cor = b.riscoRuptura === "elevado" ? "var(--color-negative)" : b.riscoRuptura === "moderado" ? "var(--color-warning)" : "var(--color-positive)";
  return (
    <Card className="lg:col-span-1 flex flex-col gap-3" info={{ titulo: "Briefing executivo", oQue: "Resumo do dia para abrir a operação: saldo, runway, alertas e oportunidades em uma olhada.", comoCalcula: "Gerado pelo motor executivo a partir do saldo atual, do runway e dos sinais de risco e oportunidade dos seus lançamentos." }}>
      <span className="text-label font-medium text-muted">Briefing executivo · {b.data}</span>
      {resumo && <p className="m-0 text-body leading-[1.5] text-ink">{resumo}</p>}
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
function InsightsCard({ insights, narr = {} }: { insights: import("@/core/executive/types").ExecutiveInsight[]; narr?: Record<string, string> }) {
  return (
    <Card className="lg:col-span-2 flex flex-col gap-3" info={{ titulo: "Leituras priorizadas", oQue: "Lista o que merece sua atenção agora, do mais relevante para o menos, com a ação sugerida.", comoCalcula: "Cada leitura é ordenada por impacto em reais, urgência, probabilidade e criticidade calculados sobre os seus dados." }}>
      <span className="text-label font-medium text-muted">Leituras priorizadas · impacto × urgência</span>
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
              <span className="text-caption text-muted">{narr[i.id] ?? i.descricao}</span>
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
type ClasseAnom = import("@/core/executive/types").Anomalia["classe"];
const ACAO_ANOM: Record<ClasseAnom, { label: string; href: string }> = {
  despesa: { label: "Revisar despesa", href: "/dre" },
  duplicidade: { label: "Verificar duplicidade", href: "/pagamentos" },
  fraude: { label: "Investigar pagamento", href: "/pagamentos" },
};

function AnomaliasCard({ anomalias, narr = {} }: { anomalias: import("@/core/executive/types").Anomalia[]; narr?: Record<string, string> }) {
  const [revisadas, setRevisadas] = React.useState<Record<string, boolean>>({});
  const marcar = (a: import("@/core/executive/types").Anomalia) => {
    setRevisadas((r) => ({ ...r, [a.id]: true }));
    void logAcaoIA({ kind: "anomalia", titulo: `Revisada: ${a.titulo}`, detalhe: narr[a.id] ?? a.descricao, status: "executada" });
  };
  return (
    <Card className="lg:col-span-1 flex flex-col gap-3" info={{ titulo: "Anomalias", oQue: "Aponta despesas, duplicidades e pagamentos fora do padrão para você revisar antes que virem problema.", comoCalcula: "Compara cada gasto com o histórico da categoria (z-score) e cruza valores para achar duplicidade e pagamento atípico." }}>
      <div className="flex items-center gap-2">
        <Icon name="triangle-alert" size={16} color="var(--color-text-secondary)" />
        <span className="text-label font-medium text-muted">Anomalias</span>
      </div>
      {anomalias.length === 0 ? (
        <span className="text-caption text-faint">Nenhuma anomalia detectada — despesas e pagamentos dentro do padrão histórico.</span>
      ) : (
        anomalias.map((a) => {
          const acao = ACAO_ANOM[a.classe] ?? ACAO_ANOM.despesa;
          return (
            <div key={a.id} className="flex flex-col gap-1 rounded-md border border-border-soft p-3">
              <span className="inline-flex items-center gap-[6px] text-label font-medium" style={{ color: SEV_COR[a.severidade] }}>
                <span className="w-2 h-2 rounded-pill" style={{ background: SEV_COR[a.severidade] }} />{a.titulo}
              </span>
              <span className="text-caption text-muted">{narr[a.id] ?? a.descricao}</span>
              <span className="text-caption text-faint tabular-nums"><BRL value={a.valor} /></span>
              <div className="flex items-center gap-3 mt-1">
                {revisadas[a.id] ? (
                  <StatusBadge tone="positive">revisada</StatusBadge>
                ) : (
                  <>
                    <Link href={acao.href} className="text-caption font-medium text-ink underline">{acao.label} →</Link>
                    <button onClick={() => marcar(a)} className="text-caption text-muted hover:text-ink ml-auto">Marcar revisada</button>
                  </>
                )}
              </div>
            </div>
          );
        })
      )}
    </Card>
  );
}

/* ---------- Forecast ---------- */
function ForecastCard({ forecast }: { forecast: import("@/core/executive/types").Forecast }) {
  return (
    <Card className="lg:col-span-2 flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-label font-medium text-muted inline-flex items-center gap-1">
          Motor preditivo · fluxo líquido
          <InfoHint align="left" oQue="Projeta o caixa que entra menos o que sai nos próximos meses e avisa onde há pressão." comoCalcula="Média móvel ponderada dos lançamentos ajustada por sazonalidade, indicando o mês de maior aperto." />
        </span>
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
    <Card className="lg:col-span-1 flex flex-col gap-3" info={{ titulo: "Simulador de cenários", oQue: "Permite testar e se a receita cair, a despesa subir ou a inadimplência aumentar, vendo o efeito na hora.", comoCalcula: "Aplica os deltas que você escolhe nos indicadores e recalcula o score de saúde e o runway projetados." }}>
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

/* ---------- Planner Agent ---------- */
const CENARIOS_PLANNER: { id: string; label: string; sc: ScenarioInput; nota: string }[] = [
  { id: "inad", label: "Inadimplência +10pp", sc: { inadimplenciaDelta: 0.1 }, nota: "clientes atrasam mais" },
  { id: "queda", label: "Queda de receita 20%", sc: { receitaDelta: -0.2 }, nota: "retração de vendas" },
  { id: "corte", label: "Corte de despesa 10%", sc: { despesaDelta: -0.1 }, nota: "enxugar custos" },
  { id: "expansao", label: "Expansão (+15% rec · +10% desp)", sc: { receitaDelta: 0.15, despesaDelta: 0.1 }, nota: "crescer com investimento" },
];

function PlannerCard({ indic, saldo, score }: { indic: import("@/core/quant/types").IndicadoresFinanceiros; saldo: number; score: number }) {
  const cenarios = React.useMemo(
    () => CENARIOS_PLANNER.map((c) => {
      const r = simularCenario(indic, saldo, c.sc);
      return { ...c, r, delta: r.scoreProjetado - score };
    }).sort((a, b) => a.delta - b.delta), // pior impacto primeiro
    [indic, saldo, score],
  );
  return (
    <Card className="lg:col-span-3 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-label font-medium text-muted inline-flex items-center gap-2">
          <Icon name="sparkles" size={15} color="var(--color-lime)" /> Planner — cenários sugeridos e impacto
          <InfoHint align="left" oQue="Mostra cenários prontos (queda de receita, corte de custo, expansão) e o impacto de cada um, do pior para o melhor." comoCalcula="Recalcula o score de saúde e o runway sobre os seus indicadores para cada cenário sugerido." />
        </span>
        <Link href="/all4pay-ai?aba=decisao" className="text-caption text-muted hover:text-ink underline">probabilidade (Monte Carlo) em Decisão →</Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cenarios.map((c, i) => (
          <div key={c.id} className="rounded-md border border-border-soft p-3 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[15px] font-medium text-ink">{c.label}</span>
              {i === 0 && c.delta < 0 && <StatusBadge tone="warning">maior risco</StatusBadge>}
            </div>
            <span className="text-caption text-faint">{c.nota}</span>
            <div className="flex items-center gap-5 mt-1">
              <div>
                <div className="text-caption text-faint">Score</div>
                <div className="text-h3 font-medium tabular-nums" style={{ color: c.delta < 0 ? "var(--color-negative)" : c.delta > 0 ? "var(--color-positive)" : "var(--color-ink)" }}>
                  {c.r.scoreProjetado}{c.delta !== 0 && <span className="text-label"> ({c.delta > 0 ? "+" : ""}{c.delta})</span>}
                </div>
              </div>
              <div>
                <div className="text-caption text-faint">Runway</div>
                <div className="text-h3 font-medium tabular-nums text-ink">{c.r.runwayMeses}m</div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <span className="text-caption text-faint">Cenários propostos pelo Planner, recalculados sobre os seus indicadores (impacto no score e no runway). Ajuste fino no Simulador; probabilidade de ruptura via Monte Carlo em Decisão.</span>
    </Card>
  );
}

/* ---------- Memória ---------- */
function MemoriaCard({ memoria }: { memoria: import("@/core/executive/types").PadraoMemoria[] }) {
  if (memoria.length === 0) return null;
  return (
    <Card className="lg:col-span-3 flex flex-col gap-3" info={{ titulo: "Memória da operação", oQue: "Guarda os padrões que o sistema aprendeu sobre a sua empresa, como sazonalidade e clientes críticos.", comoCalcula: "O motor de memória observa os lançamentos ao longo do tempo e registra despesas recorrentes, sazonalidade e clientes de atenção." }}>
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
