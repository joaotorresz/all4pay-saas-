"use client";

import * as React from "react";
import { Card, Skeleton, Icon } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import { useQuantitativo, useCentroInteligencia, useRiscoInput } from "./hooks";
import { usePeriod } from "./PeriodContext";
import type { RiskMovement } from "@/core/risk-engine/types";

/* ----------------------------- helpers ----------------------------- */

const scoreColor = (s: number) =>
  s >= 75 ? "var(--color-positive)" : s >= 50 ? "var(--color-warning)" : "var(--color-negative)";

const sevColor = (sev: string) =>
  /crit|alta/i.test(sev) ? "var(--color-negative)" : /med|aten/i.test(sev) ? "var(--color-warning)" : "var(--color-text-tertiary)";

/** Data realizada de um movimento (para janela retroativa do período). */
const realizado = (m: RiskMovement): string | null =>
  m.paid_date ?? (m.status === "pago" ? m.due_date : null);

function CardSkeleton({ tall }: { tall?: boolean }) {
  return <Skeleton className={tall ? "h-[200px] w-full" : "h-[120px] w-full"} rounded="card" />;
}

function Header({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <Icon name={icon} size={15} color="var(--color-text-secondary)" />
      <span className="text-label font-medium text-muted">{children}</span>
    </div>
  );
}

function BarShare({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-[5px] rounded-pill bg-surface-2 overflow-hidden">
      <div className="h-full rounded-pill" style={{ width: `${Math.max(2, Math.min(100, pct * 100))}%`, background: color }} />
    </div>
  );
}

/* ----------------------- Saúde financeira (KPIs) ----------------------- */

export function SaudeFinanceiraCard() {
  const { data, isLoading } = useQuantitativo();
  if (isLoading || !data) return <CardSkeleton />;
  const ind = data.indicadores;
  const sc = data.score;
  return (
    <Card className="flex flex-col gap-3">
      <Header icon="activity">Saúde financeira</Header>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Kpi label="Score" value={`${sc.score}`} suffix="/100" color={scoreColor(sc.score)} hint={sc.classificacao} />
        <Kpi label="Runway" value={ind.runwayMeses >= 99 ? "99+" : ind.runwayMeses.toFixed(1)} suffix="meses" />
        <Kpi label="Burn rate" value={ind.burnRate > 0 ? formatBRL(ind.burnRate) : "—"} suffix={ind.burnRate > 0 ? "/mês" : "gera caixa"} />
        <Kpi label="Liquidez" value={ind.liquidezCorrente.toFixed(2)} suffix="corrente" />
      </div>
    </Card>
  );
}

function Kpi({ label, value, suffix, color, hint }: { label: string; value: string; suffix?: string; color?: string; hint?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-caption text-faint">{label}</span>
      <span className="text-value-lg leading-none font-medium tabular-nums" style={{ color: color ?? "var(--color-ink)" }}>{value}</span>
      {suffix && <span className="text-caption text-faint mt-[2px]">{suffix}</span>}
      {hint && <span className="text-caption text-muted capitalize">{hint}</span>}
    </div>
  );
}

/* --------------------------- IA Insights --------------------------- */

export function IAInsightsCard() {
  const { data, isLoading } = useCentroInteligencia();
  if (isLoading || !data) return <CardSkeleton tall />;
  const insights = (data.insights ?? []).slice(0, 4);
  return (
    <Card className="flex flex-col gap-3">
      <Header icon="sparkles">IA · insights do dia</Header>
      {insights.length === 0 ? (
        <span className="text-caption text-faint">Sem insights relevantes agora.</span>
      ) : (
        insights.map((i) => (
          <div key={i.id} className="flex items-start gap-2 py-2 border-t border-border-soft first:border-t-0">
            <span className="w-2 h-2 rounded-pill mt-[6px] shrink-0" style={{ background: sevColor(i.severidade) }} />
            <div className="min-w-0">
              <div className="text-[14px] font-medium text-ink">{i.titulo}</div>
              <div className="text-caption text-muted leading-[1.45]">{i.descricao}</div>
            </div>
          </div>
        ))
      )}
    </Card>
  );
}

/* ---------------------------- Anomalias ---------------------------- */

export function AnomaliasCard() {
  const { data, isLoading } = useCentroInteligencia();
  if (isLoading || !data) return <CardSkeleton tall />;
  const anomalias = (data.anomalias ?? []).slice(0, 4);
  return (
    <Card className="flex flex-col gap-3">
      <Header icon="triangle-alert">Anomalias</Header>
      {anomalias.length === 0 ? (
        <span className="text-caption text-faint">Nenhuma anomalia detectada.</span>
      ) : (
        anomalias.map((a) => (
          <div key={a.id} className="flex items-center gap-3 py-2 border-t border-border-soft first:border-t-0">
            <span className="w-2 h-2 rounded-pill shrink-0" style={{ background: sevColor(a.severidade) }} />
            <div className="flex-1 min-w-0">
              <div className="text-[14px] text-ink truncate">{a.titulo}</div>
              <div className="text-caption text-faint truncate">{a.descricao}</div>
            </div>
            <span className="text-caption text-muted tabular-nums">{formatBRL(a.valor)}</span>
          </div>
        ))
      )}
    </Card>
  );
}

/* ----------------------- Top clientes (período) ----------------------- */

export function TopClientesCard() {
  const { data, isLoading } = useRiscoInput();
  const period = usePeriod();
  if (isLoading || !data) return <CardSkeleton tall />;

  const acc = new Map<string, number>();
  for (const m of data.movements) {
    if (m.type !== "entrada") continue;
    const d = realizado(m);
    if (!d || d < period.from || d > period.to) continue;
    const id = m.party_id ?? "—";
    acc.set(id, (acc.get(id) ?? 0) + m.amount);
  }
  const total = Array.from(acc.values()).reduce((s, v) => s + v, 0);
  const top = Array.from(acc.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <Card className="flex flex-col gap-3">
      <Header icon="trending-up">Top clientes · {period.label.toLowerCase()}</Header>
      {top.length === 0 || total === 0 ? (
        <span className="text-caption text-faint">Sem receita realizada no período.</span>
      ) : (
        top.map(([id, val]) => {
          const nome = data.partyNames?.[id] ?? (id === "—" ? "Sem contraparte" : id);
          const share = total > 0 ? val / total : 0;
          return (
            <div key={id} className="flex flex-col gap-1 py-[6px] border-t border-border-soft first:border-t-0">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-ink truncate">{nome}</span>
                <span className="text-caption text-muted tabular-nums shrink-0">{formatBRL(val)} · {Math.round(share * 100)}%</span>
              </div>
              <BarShare pct={share} color="var(--color-ink)" />
            </div>
          );
        })
      )}
    </Card>
  );
}

/* ------------------- Maiores categorias de despesa ------------------- */

export function MaioresCategoriasCard() {
  const { data, isLoading } = useRiscoInput();
  const period = usePeriod();
  if (isLoading || !data) return <CardSkeleton tall />;

  const acc = new Map<string, number>();
  for (const m of data.movements) {
    if (m.type !== "saida") continue;
    const d = realizado(m);
    if (!d || d < period.from || d > period.to) continue;
    const cat = (m.category && String(m.category)) || "Outras";
    acc.set(cat, (acc.get(cat) ?? 0) + m.amount);
  }
  const total = Array.from(acc.values()).reduce((s, v) => s + v, 0);
  const top = Array.from(acc.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <Card className="flex flex-col gap-3">
      <Header icon="receipt">Maiores despesas · {period.label.toLowerCase()}</Header>
      {top.length === 0 || total === 0 ? (
        <span className="text-caption text-faint">Sem despesas no período.</span>
      ) : (
        top.map(([cat, val]) => {
          const share = total > 0 ? val / total : 0;
          return (
            <div key={cat} className="flex flex-col gap-1 py-[6px] border-t border-border-soft first:border-t-0">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-ink truncate capitalize">{cat}</span>
                <span className="text-caption text-muted tabular-nums shrink-0">{formatBRL(val)} · {Math.round(share * 100)}%</span>
              </div>
              <BarShare pct={share} color="var(--color-warning)" />
            </div>
          );
        })
      )}
    </Card>
  );
}

/* --------------------------- Últimos gastos --------------------------- */

export function UltimosGastosCard() {
  const { data, isLoading } = useRiscoInput();
  if (isLoading || !data) return <CardSkeleton tall />;
  const gastos = data.movements
    .filter((m) => m.type === "saida" && realizado(m))
    .sort((a, b) => (realizado(b) ?? "").localeCompare(realizado(a) ?? ""))
    .slice(0, 5);
  return (
    <Card className="flex flex-col gap-3">
      <Header icon="arrow-down-to-line">Últimos gastos</Header>
      {gastos.length === 0 ? (
        <span className="text-caption text-faint">Nenhum gasto liquidado ainda.</span>
      ) : (
        gastos.map((m) => {
          const nome = (m.party_id && data.partyNames?.[m.party_id]) || String(m.category ?? "Despesa");
          return (
            <div key={m.id} className="flex items-center justify-between gap-3 py-2 border-t border-border-soft first:border-t-0">
              <div className="min-w-0">
                <div className="text-[14px] text-ink truncate">{nome}</div>
                <div className="text-caption text-faint tabular-nums">{fmtDia(realizado(m))}</div>
              </div>
              <span className="text-[14px] text-ink tabular-nums">{formatBRL(m.amount)}</span>
            </div>
          );
        })
      )}
    </Card>
  );
}

/* ---------------------------- Pendências ---------------------------- */

export function PendenciasCard() {
  const { data, isLoading } = useRiscoInput();
  if (isLoading || !data) return <CardSkeleton />;
  const hoje = data.hoje;
  const em7 = addDaysISO(hoje, 7);
  let aReceber = 0, aPagar = 0, vencendo = 0, vencidos = 0;
  for (const m of data.movements) {
    if (m.status !== "pendente") continue;
    if (m.type === "entrada") aReceber++; else aPagar++;
    if (m.due_date < hoje) vencidos++;
    else if (m.due_date <= em7) vencendo++;
  }
  return (
    <Card className="flex flex-col gap-3">
      <Header icon="list-checks">Pendências</Header>
      <div className="grid grid-cols-2 gap-4">
        <Conta n={aReceber} label="A receber" />
        <Conta n={aPagar} label="A pagar" />
        <Conta n={vencendo} label="Vencem em 7d" tone="var(--color-warning)" />
        <Conta n={vencidos} label="Vencidos" tone="var(--color-negative)" />
      </div>
    </Card>
  );
}

function Conta({ n, label, tone }: { n: number; label: string; tone?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-value-lg leading-none font-medium tabular-nums" style={{ color: tone ?? "var(--color-ink)" }}>{n}</span>
      <span className="text-caption text-faint mt-[2px]">{label}</span>
    </div>
  );
}

/* ------------------------------ utils ------------------------------ */

function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmtDia(iso: string | null): string {
  if (!iso) return "—";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}
