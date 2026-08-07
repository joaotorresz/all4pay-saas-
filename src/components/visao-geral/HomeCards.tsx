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
