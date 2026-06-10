"use client";

import * as React from "react";
import {
  LineChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { Card, Skeleton, Icon } from "@/components/ui";
import { formatBRL, formatBRLCompact } from "@/lib/format";
import { useDecisao } from "@/components/visao-geral/hooks";
import {
  type RiscoNivel,
  type RiscoDimensao,
  type Recomendacao,
  type ModoExecucao,
  type AcaoAutonoma,
} from "@/core/decision/types";

const NIVEL_COR: Record<RiscoNivel, string> = {
  baixo: "var(--color-positive)",
  moderado: "var(--color-warning)",
  alto: "var(--color-negative)",
  critico: "var(--color-negative)",
};
const MODO_LABEL: Record<ModoExecucao, { label: string; cor: string }> = {
  automatico: { label: "automático", cor: "var(--color-positive)" },
  proposto: { label: "proposto", cor: "var(--color-warning)" },
  requer_aprovacao: { label: "requer aprovação", cor: "var(--color-negative)" },
};

export function DecisaoView() {
  const { data, isLoading, isError } = useDecisao();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Skeleton className="h-[120px] lg:col-span-3" rounded="card" />
        <Skeleton className="h-[320px] lg:col-span-2" rounded="card" />
        <Skeleton className="h-[320px] lg:col-span-1" rounded="card" />
      </div>
    );
  }
  if (isError || !data) {
    return <Card><p className="text-muted">Não foi possível gerar a decisão financeira.</p></Card>;
  }

  const { risco, previsao, recomendacoes, plano, features } = data;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start pb-4">
      {/* Headline (decision brief) */}
      <Card className="lg:col-span-3 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="w-[26px] h-[26px] rounded-sm bg-lime inline-flex items-center justify-center">
            <Icon name="sparkles" size={14} color="var(--color-on-lime)" />
          </span>
          <span className="text-label font-medium text-muted">Decisão financeira · brief executivo</span>
        </div>
        <p className="m-0 text-h3 leading-[1.5] font-regular text-ink">{data.headline}</p>
      </Card>

      {/* Risk matrix */}
      <Card className="lg:col-span-2 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-label font-medium text-muted">Matriz de risco probabilística</span>
          <span className="inline-flex items-center gap-2 text-label font-medium" style={{ color: NIVEL_COR[risco.nivelGeral] }}>
            stress {Math.round(risco.probabilidadeStress * 100)}%
            <span className="w-2 h-2 rounded-pill" style={{ background: NIVEL_COR[risco.nivelGeral] }} />
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3">
          {risco.dimensoes.map((d) => (
            <RiscoRow key={d.id} d={d} />
          ))}
        </div>
      </Card>

      {/* Previsão Monte Carlo */}
      <Card className="lg:col-span-1 flex flex-col gap-2">
        <span className="text-label font-medium text-muted">Previsão de caixa · Monte Carlo</span>
        <div className="flex items-end gap-2">
          <span className="text-value-lg leading-none font-medium tabular-nums" style={{ color: previsao.probabilidadeNegativo >= 0.2 ? "var(--color-negative)" : "var(--color-positive)" }}>
            {Math.round(previsao.probabilidadeNegativo * 100)}%
          </span>
          <span className="text-caption text-faint mb-1">de ficar negativo (90d)</span>
        </div>
        <PrevisaoChart bandas={previsao.bandas} />
        <span className="text-caption text-faint">{previsao.texto}</span>
        <div className="flex justify-between text-caption text-muted tabular-nums pt-1 border-t border-border-soft">
          <span>p10 {formatBRLCompact(previsao.caixaFinalP10)}</span>
          <span>p50 {formatBRLCompact(previsao.caixaFinalP50)}</span>
          <span>p90 {formatBRLCompact(previsao.caixaFinalP90)}</span>
        </div>
      </Card>

      {/* Recomendações com impacto */}
      <Card className="lg:col-span-2 flex flex-col gap-3">
        <span className="text-label font-medium text-muted">Recomendações · impacto simulado</span>
        {recomendacoes.length === 0 ? (
          <span className="text-caption text-faint">Sem ações de melhoria relevantes no momento.</span>
        ) : (
          recomendacoes.map((r) => <RecomendacaoRow key={r.id} r={r} />)
        )}
      </Card>

      {/* Plano autônomo */}
      <Card className="lg:col-span-1 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Icon name="network" size={16} color="var(--color-text-secondary)" />
          <span className="text-label font-medium text-muted">Ações autônomas</span>
        </div>
        <span className="text-caption" style={{ color: plano.ativo ? NIVEL_COR[plano.severidade] : "var(--color-text-secondary)" }}>
          {plano.resumo}
        </span>
        <div className="flex flex-col gap-2">
          {plano.acoes.map((a) => <AcaoRow key={a.ordem} a={a} />)}
        </div>
      </Card>

      {/* Feature store */}
      <Card className="lg:col-span-3 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Icon name="layers" size={16} color="var(--color-text-secondary)" />
          <span className="text-label font-medium text-muted">Feature Store · variáveis do modelo</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-x-5 gap-y-3">
          <Feat label="Runway" value={`${features.atual.runwayMeses}m`} />
          <Feat label="Burn / mês" value={features.atual.burnMensal > 0 ? formatBRL(features.atual.burnMensal) : "—"} />
          <Feat label="Liquidez" value={features.atual.liquidezCorrente >= 10 ? "10+" : features.atual.liquidezCorrente.toFixed(2)} />
          <Feat label="Inadimplência" value={`${Math.round(features.atual.inadimplencia * 100)}%`} />
          <Feat label="Conc. receita" value={`${Math.round(features.atual.concentracaoReceita * 100)}%`} />
          <Feat label="Conc. fornecedor" value={`${Math.round(features.atual.concentracaoFornecedor * 100)}%`} />
          <Feat label="Ticket médio" value={formatBRL(features.atual.ticketMedio)} />
          <Feat label="Margem op." value={`${Math.round(features.atual.margemOperacional * 100)}%`} />
          <Feat label="Crescimento" value={`${Math.round(features.atual.crescimentoMensal * 100)}%`} />
          <Feat label="Sazonalidade" value={`${Math.round(features.atual.sazonalidade * 100)}%`} />
          <Feat label="Score saúde" value={`${features.atual.scoreSaude}/100`} />
          <Feat label="Prob. ruptura" value={`${Math.round(features.atual.probRuptura * 100)}%`} />
        </div>
      </Card>
    </div>
  );
}

function RiscoRow({ d }: { d: RiscoDimensao }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] text-ink">{d.label}</span>
        <span className="text-label font-medium tabular-nums" style={{ color: NIVEL_COR[d.nivel] }}>
          {Math.round(d.probabilidade * 100)}%
        </span>
      </div>
      <div className="h-[6px] rounded-pill bg-surface-2 overflow-hidden">
        <div className="h-full rounded-pill" style={{ width: `${d.probabilidade * 100}%`, background: NIVEL_COR[d.nivel] }} />
      </div>
      <span className="text-caption text-faint">{d.fator}</span>
    </div>
  );
}

function RecomendacaoRow({ r }: { r: Recomendacao }) {
  return (
    <div className="flex gap-3 py-[10px] border-t border-border-soft first:border-t-0">
      <span className="text-caption font-medium text-faint tabular-nums w-[20px] pt-[2px]">#{r.prioridade}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium text-ink">{r.titulo}</div>
        <span className="text-caption text-muted">{r.descricao}</span>
        <div className="flex flex-wrap gap-2 mt-1">
          {r.deltaRunwayDias > 0 && <Impacto label={`+${Math.round(r.deltaRunwayDias)}d runway`} bom />}
          {r.deltaScore !== 0 && <Impacto label={`${r.deltaScore > 0 ? "+" : ""}${r.deltaScore} score`} bom={r.deltaScore > 0} />}
          {r.deltaProbRuptura !== 0 && <Impacto label={`${(r.deltaProbRuptura * 100).toFixed(1)}pp risco`} bom={r.deltaProbRuptura < 0} />}
        </div>
      </div>
    </div>
  );
}

function Impacto({ label, bom }: { label: string; bom: boolean }) {
  return (
    <span
      className="text-caption font-medium rounded-pill px-2 py-[2px]"
      style={{ background: "var(--color-surface-2)", color: bom ? "var(--color-positive)" : "var(--color-negative)" }}
    >
      {label}
    </span>
  );
}

function AcaoRow({ a }: { a: AcaoAutonoma }) {
  const m = MODO_LABEL[a.modo];
  return (
    <div className="flex items-start gap-2">
      <span className="w-2 h-2 rounded-pill mt-[6px] shrink-0" style={{ background: m.cor }} />
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] text-ink">{a.acao}</span>
          <span className="text-caption font-medium" style={{ color: m.cor }}>· {m.label}</span>
        </div>
        <span className="text-caption text-faint">{a.gatilho} — {a.impacto}</span>
      </div>
    </div>
  );
}

function Feat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-[2px]">
      <span className="text-caption text-faint">{label}</span>
      <span className="text-[15px] font-medium tabular-nums text-ink">{value}</span>
    </div>
  );
}

function PrevisaoChart({ bandas }: { bandas: { dia: number; p10: number; p50: number; p90: number }[] }) {
  const data = bandas.filter((_, i) => i % 3 === 0);
  return (
    <div role="img" aria-label="Projeção de caixa por Monte Carlo (bandas p10, p50, p90)">
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="decisaoGlow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#dcff00" stopOpacity={0.26} />
              <stop offset="70%" stopColor="#dcff00" stopOpacity={0.05} />
              <stop offset="100%" stopColor="#dcff00" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--color-border-soft)" vertical={false} />
          <XAxis dataKey="dia" tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }} tickLine={false} axisLine={{ stroke: "var(--color-border-soft)" }} />
          <YAxis tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }} tickLine={false} axisLine={false} width={42} tickFormatter={(v) => formatBRLCompact(v)} />
          <ReferenceLine y={0} stroke="var(--color-negative)" strokeDasharray="4 3" />
          <Tooltip
            cursor={{ stroke: "var(--color-border)" }}
            content={({ active, payload }: any) =>
              active && payload?.length ? (
                <div className="bg-white rounded-card border border-border shadow-popover px-3 py-2 text-caption tabular-nums">
                  <div className="text-muted">p50 {formatBRL(payload.find((p: any) => p.dataKey === "p50")?.value ?? 0)}</div>
                </div>
              ) : null
            }
          />
          <Area type="monotone" dataKey="p50" stroke="none" fill="url(#decisaoGlow)" isAnimationActive={false} />
          <Line type="monotone" dataKey="p90" stroke="var(--color-border)" strokeWidth={1} dot={false} />
          <Line type="monotone" dataKey="p50" stroke="#dcff00" strokeWidth={1.4} dot={false} />
          <Line type="monotone" dataKey="p10" stroke="var(--color-border)" strokeWidth={1} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
