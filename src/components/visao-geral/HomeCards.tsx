"use client";

import * as React from "react";
import Link from "next/link";
import { BRL, Card, Skeleton, Icon } from "@/components/ui";
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

function Header({ icon, href, children }: { icon: string; href?: string; children: React.ReactNode }) {
  const inner = (
    <>
      <Icon name={icon} size={15} color="var(--color-text-secondary)" />
      <span className="text-label font-medium text-muted">{children}</span>
      {href && <Icon name="arrow-up-right" size={13} color="var(--color-faint)" className="ml-[2px] opacity-0 group-hover:opacity-100 transition-opacity" />}
    </>
  );
  // Cabeçalho-link → correlação: leva à tela de detalhe relacionada.
  return href ? (
    <Link href={href} className="group inline-flex items-center gap-2 w-fit">{inner}</Link>
  ) : (
    <div className="flex items-center gap-2">{inner}</div>
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
    <Card className="flex flex-col gap-3" info={{
      titulo: "Saúde financeira",
      oQue: "Um raio-x do seu caixa: nota geral, por quanto tempo o dinheiro dura e o ritmo de queima.",
      comoCalcula: "Score 0–100 pondera liquidez, runway, inadimplência, margem, volatilidade, concentração e crescimento. Runway = saldo ÷ burn mensal; burn = saídas líquidas médias; liquidez = ativo ÷ passivo de curto prazo.",
    }}>
      <Header icon="activity" href="/copiloto?aba=quant">Saúde financeira</Header>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Kpi label="Score" value={`${sc.score}`} suffix="/100" color={scoreColor(sc.score)} hint={sc.classificacao} />
        <Kpi label="Runway" value={ind.runwayMeses >= 99 ? "99+" : ind.runwayMeses.toFixed(1)} suffix="meses" />
        <Kpi label="Burn rate" value={ind.burnRate > 0 ? <BRL value={ind.burnRate} /> : "—"} suffix={ind.burnRate > 0 ? "/mês" : "gera caixa"} />
        <Kpi label="Liquidez" value={ind.liquidezCorrente.toFixed(2)} suffix="corrente" />
      </div>
    </Card>
  );
}

function Kpi({ label, value, suffix, color, hint }: { label: string; value: React.ReactNode; suffix?: string; color?: string; hint?: string }) {
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

/* ---------------------------- Anomalias ---------------------------- */

/* ----------------------- Top clientes (período) ----------------------- */

/* ----------------------- Top fornecedores (período) ----------------------- */

/* ------------------- Maiores categorias de despesa ------------------- */

/* --------------------------- Últimos gastos --------------------------- */

/**
 * Transações recentes — o EXTRATO da Home: as últimas movimentações
 * liquidadas, entradas e saídas juntas, na ordem em que caíram no caixa.
 * Cada linha diz o dia, quem recebeu/pagou e o valor com sinal — a leitura
 * de um extrato bancário. Clicar abre a ficha da contraparte.
 */
export function TransacoesRecentesCard() {
  const { data, isLoading } = useRiscoInput();
  if (isLoading || !data) return <CardSkeleton tall />;

  const movs = data.movements
    .filter((m) => m.status !== "cancelado" && realizado(m))
    .sort((a, b) => (realizado(b) ?? "").localeCompare(realizado(a) ?? ""))
    .slice(0, 12);

  return (
    <Card className="flex flex-col gap-3" info={{
      titulo: "Transações recentes",
      oQue: "O extrato da conta: as últimas entradas e saídas já liquidadas, na ordem em que caíram no caixa.",
      comoCalcula: "Movimentos com baixa (pagos), ordenados da data de pagamento mais recente para a mais antiga. Entradas somam (+) e saídas subtraem (−) do saldo.",
    }}>
      <Header icon="arrow-left-right" href="/recebimentos">Transações recentes</Header>
      {movs.length === 0 ? (
        <span className="text-caption text-faint">Nenhuma transação liquidada ainda.</span>
      ) : (
        <div className="flex flex-col">
          {movs.map((m) => {
            const entrada = m.type === "entrada";
            const nome = (m.party_id && data.partyNames?.[m.party_id]) || String(m.category ?? (entrada ? "Recebimento" : "Pagamento"));
            const pid = m.party_id;
            const abrir = () => pid && window.dispatchEvent(new CustomEvent("a4p:open-contato", { detail: { id: pid } }));
            return (
              <button
                key={m.id} type="button" onClick={abrir} disabled={!pid}
                className={`flex items-center gap-3 py-[10px] border-t border-border-soft first:border-t-0 text-left w-full ${pid ? "hover:bg-surface-1 transition-colors cursor-pointer" : "cursor-default"}`}
              >
                {/* seta: entrou (↙ verde) × saiu (↗ vermelho) — o sinal do extrato */}
                <span
                  className="w-[30px] h-[30px] rounded-pill inline-flex items-center justify-center shrink-0"
                  style={{ background: `color-mix(in srgb, ${entrada ? "var(--color-positive)" : "var(--color-negative)"} 14%, transparent)` }}
                  aria-hidden
                >
                  <Icon name={entrada ? "arrow-down-to-line" : "arrow-up-right"} size={14} color={entrada ? "var(--color-positive)" : "var(--color-negative)"} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] text-ink truncate inline-flex items-center gap-1">
                    {nome}{pid && <Icon name="arrow-up-right" size={11} color="var(--color-text-tertiary)" />}
                  </div>
                  <div className="text-caption text-faint tabular-nums">
                    {fmtDia(realizado(m))}{m.category ? ` · ${m.category}` : ""}
                  </div>
                </div>
                {/* valor SEMPRE em ink; o sinal e a seta dizem a direção */}
                <span className="text-[15px] text-ink tabular-nums shrink-0 whitespace-nowrap">
                  {entrada ? "+" : "−"}<BRL value={m.amount} />
                </span>
              </button>
            );
          })}
        </div>
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
    <Card className="flex flex-col gap-3" info={{
      titulo: "Pendências",
      oQue: "Quantos títulos estão em aberto e o que está vencendo.",
      comoCalcula: "Conta os lançamentos pendentes (a receber / a pagar) e, pela data de vencimento vs. hoje, os que vencem em 7 dias e os já vencidos.",
    }}>
      <Header icon="list-checks" href="/recebimentos">Pendências</Header>
      <div className="grid grid-cols-2 gap-x-4 gap-y-4">
        <Conta n={aReceber} label="A receber" />
        <Conta n={aPagar} label="A pagar" />
        <Conta n={vencendo} label="Vencem em 7d" dot="var(--color-warning)" />
        <Conta n={vencidos} label="Vencidos" dot="var(--color-negative)" />
      </div>
    </Card>
  );
}

function Conta({ n, label, dot }: { n: number; label: string; dot?: string }) {
  // DS padrão: número SEMPRE ink; o tipo (atenção/vencido) vai num dot no rótulo.
  return (
    <div className="flex flex-col">
      <span className="text-[28px] leading-none font-semibold tabular-nums text-ink">{n}</span>
      <span className="text-caption text-faint mt-[3px] inline-flex items-center gap-[5px]">
        {dot && <span className="w-[6px] h-[6px] rounded-pill shrink-0" style={{ background: dot }} />}
        {label}
      </span>
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
