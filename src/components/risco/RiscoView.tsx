"use client";

import * as React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { Card, Skeleton, Icon } from "@/components/ui";
import { formatBRL, formatBRLCompact } from "@/lib/format";
import { isDemo } from "@/lib/demo";
import { useRiscoCaixa } from "@/components/visao-geral/hooks";
import type { Nivel, PilarResult, LiquidezPonto, StressCenario, Alerta } from "@/core/risk-engine/types";

const NIVEL_COLOR: Record<Nivel, string> = {
  baixo: "var(--color-positive)",
  medio: "var(--color-warning)",
  alto: "var(--color-negative)",
  critico: "var(--color-negative)",
};
const NIVEL_LABEL: Record<Nivel, string> = {
  baixo: "Risco baixo",
  medio: "Risco médio",
  alto: "Risco alto",
  critico: "Risco crítico",
};
const barColor = (s: number) =>
  s >= 75 ? "var(--color-positive)" : s >= 50 ? "var(--color-warning)" : "var(--color-negative)";

export function RiscoView() {
  const { data, isLoading, isError } = useRiscoCaixa();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Skeleton className="h-[220px] lg:col-span-1" rounded="card" />
        <Skeleton className="h-[220px] lg:col-span-2" rounded="card" />
        <Skeleton className="h-[320px] lg:col-span-3" rounded="card" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <Card>
        <p className="text-muted">Não foi possível calcular o risco de caixa.</p>
      </Card>
    );
  }

  const meses = (d: number) => (d >= 999 ? "24+ meses" : `${(d / 30).toFixed(1)} meses`);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start pb-4">
      {/* Score */}
      <Card className="lg:col-span-1 flex flex-col gap-4">
        <div className="text-label font-medium text-muted">Score de risco de caixa</div>
        <div className="flex items-end gap-3">
          <span className="text-[52px] leading-none font-medium tabular-nums" style={{ color: NIVEL_COLOR[data.nivel] }}>
            {data.score}
          </span>
          <span className="text-h3 text-faint mb-1">/100</span>
        </div>
        <span
          className="self-start inline-flex items-center gap-2 rounded-pill px-3 py-1 text-label font-medium"
          style={{ background: "var(--color-surface-2)", color: NIVEL_COLOR[data.nivel] }}
        >
          <span className="w-2 h-2 rounded-pill" style={{ background: NIVEL_COLOR[data.nivel] }} />
          {NIVEL_LABEL[data.nivel]}
        </span>
        <div className="h-2 rounded-pill bg-surface-2 overflow-hidden">
          <div className="h-full rounded-pill" style={{ width: `${data.score}%`, background: NIVEL_COLOR[data.nivel] }} />
        </div>
        <div className="flex gap-6 pt-1">
          <Metric label="Prob. de ruptura" value={`${(data.probabilidadeRuptura * 100).toFixed(0)}%`} />
          <Metric label="Runway (base)" value={meses(data.runway.base)} />
        </div>
      </Card>

      {/* Narrativa executiva */}
      <Card className="lg:col-span-2 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="w-[26px] h-[26px] rounded-sm bg-lime inline-flex items-center justify-center">
            <Icon name="sparkles" size={14} color="var(--color-on-lime)" />
          </span>
          <span className="text-label font-medium text-muted">Interpretação executiva</span>
        </div>
        <p className="m-0 text-h3 leading-[1.45] font-regular text-ink">{data.narrativa}</p>
        {data.fatoresCriticos.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {data.fatoresCriticos.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-[6px] text-caption text-muted bg-surface-2 rounded-pill px-3 py-1">
                <span className="w-[6px] h-[6px] rounded-pill bg-negative" />
                {f}
              </span>
            ))}
          </div>
        )}
      </Card>

      {/* Runway cenários */}
      <Card className="lg:col-span-1 flex flex-col gap-3">
        <div className="text-label font-medium text-muted">Runway por cenário</div>
        <Cenario label="Otimista" value={meses(data.runway.otimista)} tone="var(--color-positive)" />
        <Cenario label="Base" value={meses(data.runway.base)} tone="var(--color-ink)" />
        <Cenario label="Pessimista" value={meses(data.runway.pessimista)} tone="var(--color-negative)" />
      </Card>

      {/* Liquidez projetada */}
      <Card className="lg:col-span-2 flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="text-label font-medium text-muted">Liquidez projetada (60 dias)</span>
          {data.rupturaDia !== null && (
            <span className="text-caption font-medium text-negative">Ruptura em {data.rupturaDia} dias</span>
          )}
        </div>
        <LiquidezChart pontos={data.liquidez} rupturaDia={data.rupturaDia} />
      </Card>

      {/* Pilares (explicável/auditável) */}
      <Card className="lg:col-span-2 flex flex-col gap-3">
        <span className="text-label font-medium text-muted">Composição do score (pilares)</span>
        <div className="flex flex-col gap-[10px]">
          {data.componentes.map((c) => (
            <PilarRow key={c.id} c={c} />
          ))}
        </div>
      </Card>

      {/* Concentração */}
      <Card className="lg:col-span-1 flex flex-col gap-3">
        <span className="text-label font-medium text-muted">Concentração de receita</span>
        {data.concentracao.top.length === 0 && <span className="text-caption text-faint">Sem dados.</span>}
        {data.concentracao.top.map((c) => (
          <div key={c.id} className="flex flex-col gap-1">
            <div className="flex justify-between text-caption">
              <span className="text-ink truncate">{c.name}</span>
              <span className="text-muted tabular-nums">{(c.share * 100).toFixed(0)}%</span>
            </div>
            <div className="h-[6px] rounded-pill bg-surface-2 overflow-hidden">
              <div className="h-full rounded-pill bg-ink" style={{ width: `${c.share * 100}%` }} />
            </div>
          </div>
        ))}
      </Card>

      {/* Stress testing */}
      <Card className="lg:col-span-2 flex flex-col gap-3">
        <span className="text-label font-medium text-muted">Stress testing</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data.stress.map((s) => (
            <StressCard key={s.id} s={s} />
          ))}
        </div>
      </Card>

      {/* Alertas */}
      <Card className="lg:col-span-1 flex flex-col gap-3">
        <span className="text-label font-medium text-muted">Alertas</span>
        {data.alertas.map((a, i) => (
          <AlertaRow key={i} a={a} />
        ))}
      </Card>

      {isDemo && (
        <Card className="lg:col-span-3 bg-surface-2" elevated={false}>
          <div className="flex items-start gap-3">
            <Icon name="trending-up" size={18} color="var(--color-text-secondary)" />
            <div>
              <div className="text-label font-medium text-ink">Comparativo setorial · ilustrativo</div>
              <p className="m-0 text-caption text-muted mt-1 max-w-[70ch]">
                Empresas de porte semelhante no setor operam, em média, com runway de ~8 meses e
                inadimplência abaixo de 12%. (Benchmark anonimizado real exige dados cross-tenant —
                disponível quando a base estiver conectada.)
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-caption text-faint">{label}</div>
      <div className="text-h3 font-medium text-ink tabular-nums">{value}</div>
    </div>
  );
}

function Cenario({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="inline-flex items-center gap-2 text-[14px] text-ink">
        <span className="w-2 h-2 rounded-pill" style={{ background: tone }} />
        {label}
      </span>
      <span className="text-[14px] font-medium tabular-nums" style={{ color: tone }}>{value}</span>
    </div>
  );
}

function PilarRow({ c }: { c: PilarResult }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-baseline">
        <span className="text-[14px] text-ink">
          {c.label} <span className="text-caption text-faint">· {Math.round(c.peso * 100)}%</span>
        </span>
        <span className="text-label font-medium tabular-nums" style={{ color: barColor(c.score) }}>{c.score}</span>
      </div>
      <div className="h-[6px] rounded-pill bg-surface-2 overflow-hidden">
        <div className="h-full rounded-pill" style={{ width: `${c.score}%`, background: barColor(c.score) }} />
      </div>
      <span className="text-caption text-faint">{c.detalhe}</span>
    </div>
  );
}

function StressCard({ s }: { s: StressCenario }) {
  return (
    <div className="rounded-md border border-border-soft p-3 flex flex-col gap-1">
      <span className="text-[14px] font-medium text-ink">{s.label}</span>
      <span className="text-caption text-faint">{s.descricao}</span>
      <div className="flex items-center gap-4 pt-1 tabular-nums">
        <span className="text-label" style={{ color: s.impactoSaldo < 0 ? "var(--color-negative)" : "var(--color-positive)" }}>
          {s.impactoSaldo < 0 ? "−" : "+"}{formatBRL(Math.abs(s.impactoSaldo))}
        </span>
        <span className="text-caption text-muted">
          runway {s.runwayDias >= 999 ? "24+ m" : `${(s.runwayDias / 30).toFixed(1)} m`}
        </span>
      </div>
    </div>
  );
}

function AlertaRow({ a }: { a: Alerta }) {
  const color = a.nivel === "critico" ? "var(--color-negative)" : a.nivel === "atencao" ? "var(--color-warning)" : "var(--color-text-secondary)";
  return (
    <div className="flex gap-[10px]">
      <span className="w-2 h-2 rounded-pill mt-[6px] shrink-0" style={{ background: color }} />
      <div>
        <div className="text-[14px] font-medium text-ink">{a.titulo}</div>
        <div className="text-caption text-muted">{a.detalhe}</div>
      </div>
    </div>
  );
}

function LiquidezChart({ pontos, rupturaDia }: { pontos: LiquidezPonto[]; rupturaDia: number | null }) {
  const rupturaLabel = rupturaDia !== null ? pontos[rupturaDia]?.label : null;
  return (
    <div role="img" aria-label={`Projeção de liquidez para 60 dias. ${rupturaDia !== null ? `Ruptura projetada em ${rupturaDia} dias.` : "Sem ruptura no horizonte."}`}>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={pontos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="liq" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-lime)" stopOpacity="0.30" />
              <stop offset="70%" stopColor="var(--color-lime)" stopOpacity="0.06" />
              <stop offset="100%" stopColor="var(--color-lime)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--color-border-soft)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} tickLine={false} axisLine={{ stroke: "var(--color-border-soft)" }} interval={9} />
          <YAxis tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => formatBRLCompact(v)} />
          <ReferenceLine y={0} stroke="var(--color-negative)" strokeDasharray="4 3" />
          {rupturaLabel && <ReferenceLine x={rupturaLabel} stroke="var(--color-negative)" strokeWidth={1} />}
          <Tooltip
            cursor={{ stroke: "var(--color-border)" }}
            content={({ active, payload, label }: any) =>
              active && payload?.length ? (
                <div className="bg-white rounded-card border border-border shadow-popover px-3 py-[10px] text-caption">
                  <div className="font-medium text-ink mb-1">Dia {label}</div>
                  <div className="text-muted tabular-nums">{formatBRL(payload[0].value)}</div>
                </div>
              ) : null
            }
          />
          <Area type="monotone" dataKey="saldo" stroke="var(--color-lime)" strokeWidth={1.4} fill="url(#liq)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
