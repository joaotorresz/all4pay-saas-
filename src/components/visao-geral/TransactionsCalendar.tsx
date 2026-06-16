"use client";

import * as React from "react";
import { Card, Icon, BRL, Skeleton } from "@/components/ui";
import { formatBRLCompact } from "@/lib/format";
import { useRiscoInput } from "./hooks";
import { WidgetHeader, EmptyState } from "./shared";
import { calcularLiquidezProjetada } from "@/core/risk-engine/liquidez.engine";
import type { RiskMovement } from "@/core/risk-engine/types";

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const POSITIVE = "var(--color-positive)";
const NEGATIVE = "var(--color-negative)";

/** Data que "conta" para o calendário: pago → paid_date; senão → vencimento. */
const diaDoMovimento = (m: RiskMovement) =>
  (m.status === "pago" ? m.paid_date || m.due_date : m.due_date).slice(0, 10);

interface DiaInfo { entrada: number; saida: number; itens: RiskMovement[] }

/** Calendário de transações — grade do mês com entradas/saídas por dia.
 *  Clicar num dia abre a lista daquele dia. Mês navegável. Demo-safe. */
export function TransactionsCalendar() {
  const { data, isLoading, isError } = useRiscoInput();
  const hoje = data?.hoje ?? new Date().toISOString().slice(0, 10);
  const [ano, setAno] = React.useState(() => Number(hoje.slice(0, 4)));
  const [mes, setMes] = React.useState(() => Number(hoje.slice(5, 7)) - 1); // 0-based
  const [diaSel, setDiaSel] = React.useState<string | null>(null);

  const porDia = React.useMemo(() => {
    const map = new Map<string, DiaInfo>();
    for (const m of data?.movements ?? []) {
      if (m.status === "cancelado") continue;
      const dia = diaDoMovimento(m);
      if (!dia.startsWith(`${ano}-${String(mes + 1).padStart(2, "0")}`)) continue;
      const info = map.get(dia) ?? { entrada: 0, saida: 0, itens: [] };
      if (m.type === "entrada") info.entrada += m.amount; else info.saida += m.amount;
      info.itens.push(m);
      map.set(dia, info);
    }
    return map;
  }, [data, ano, mes]);

  // Saldo esperado + risco de ruptura por dia (projeção de liquidez do motor de risco).
  const projecao = React.useMemo(() => {
    const map = new Map<string, { saldo: number; ruptura: boolean }>();
    if (!data) return map;
    for (const p of calcularLiquidezProjetada(data).pontos) map.set(p.date, { saldo: p.saldo, ruptura: p.ruptura });
    return map;
  }, [data]);
  const temRuptura = React.useMemo(
    () => Array.from(projecao.entries()).some(([d, p]) => p.ruptura && d.startsWith(`${ano}-${String(mes + 1).padStart(2, "0")}`)),
    [projecao, ano, mes],
  );

  const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const navega = (delta: number) => {
    const d = new Date(ano, mes + delta, 1);
    setAno(d.getFullYear()); setMes(d.getMonth()); setDiaSel(null);
  };

  const iso = (dia: number) => `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  const selInfo = diaSel ? porDia.get(diaSel) : null;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <WidgetHeader title="Calendário de transações" subtitle="entradas e saídas por dia" />
        <div className="flex items-center gap-1">
          <button onClick={() => navega(-1)} aria-label="Mês anterior" className="p-1 rounded-sm hover:bg-surface-2">
            <Icon name="chevron-left" size={16} color="var(--color-text-secondary)" />
          </button>
          <span className="text-label font-medium text-ink w-[96px] text-center tabular-nums">{MES[mes]} {ano}</span>
          <button onClick={() => navega(1)} aria-label="Próximo mês" className="p-1 rounded-sm hover:bg-surface-2">
            <Icon name="chevron-right" size={16} color="var(--color-text-secondary)" />
          </button>
        </div>
      </div>

      {isLoading && <Skeleton className="h-[280px] w-full" rounded="md" />}
      {isError && <EmptyState title="Não foi possível carregar o calendário" />}

      {!isLoading && !isError && (
        <>
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((w) => (
              <span key={w} className="text-[12px] text-faint text-center py-1">{w}</span>
            ))}
            {Array.from({ length: primeiroDiaSemana }).map((_, i) => <span key={`b${i}`} />)}
            {Array.from({ length: diasNoMes }).map((_, i) => {
              const dia = i + 1;
              const key = iso(dia);
              const info = porDia.get(key);
              const proj = projecao.get(key);
              const isHoje = key === hoje;
              const sel = key === diaSel;
              // Borda vermelha quando há risco de ruptura (saldo projetado negativo).
              const borda = proj?.ruptura ? "border-negative" : sel ? "border-ink" : "border-border-soft";
              return (
                <button
                  key={key}
                  onClick={() => setDiaSel(sel ? null : key)}
                  className={[
                    "flex flex-col items-stretch gap-[2px] rounded-sm border p-1 min-h-[64px] text-left transition-colors",
                    borda, sel ? "bg-surface-2" : "hover:bg-surface-1",
                  ].join(" ")}
                >
                  <span className={["text-[12px] tabular-nums", isHoje ? "text-on-lime bg-lime rounded-pill px-[5px] self-start" : "text-muted"].join(" ")}>{dia}</span>
                  {info?.entrada ? <span className="text-[11px] tabular-nums leading-tight" style={{ color: POSITIVE }}>+{formatBRLCompact(info.entrada)}</span> : null}
                  {info?.saida ? <span className="text-[11px] tabular-nums leading-tight" style={{ color: NEGATIVE }}>−{formatBRLCompact(info.saida)}</span> : null}
                  {proj ? (
                    <span className="text-[10px] tabular-nums leading-tight mt-auto" style={{ color: proj.ruptura ? NEGATIVE : "var(--color-text-tertiary)" }}>
                      ≈{formatBRLCompact(proj.saldo)}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {temRuptura && (
            <span className="text-[12px] text-faint leading-snug">
              <span className="inline-block w-3 h-3 align-[-2px] mr-1 rounded-[3px] border border-negative" />
              Borda vermelha = risco de ruptura (saldo esperado negativo no dia).
            </span>
          )}

          {diaSel && (() => {
            const proj = projecao.get(diaSel);
            return (
              <div className={["flex flex-col gap-2 rounded-md border p-3", proj?.ruptura ? "border-negative" : "border-border-soft"].join(" ")}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-caption font-medium text-muted">{diaSel.split("-").reverse().join("/")}</span>
                  {proj && (
                    <span className="text-caption tabular-nums" style={{ color: proj.ruptura ? NEGATIVE : "var(--color-text-secondary)" }}>
                      Saldo esperado: {proj.saldo < 0 ? "−" : ""}<BRL value={Math.abs(proj.saldo)} />
                    </span>
                  )}
                </div>
                {selInfo?.itens.length ? selInfo.itens.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-3 text-caption">
                    <span className="text-ink truncate flex-1">{m.category || (m.type === "entrada" ? "Entrada" : "Saída")}</span>
                    <span className="tabular-nums" style={{ color: m.type === "entrada" ? POSITIVE : NEGATIVE }}>
                      {m.type === "entrada" ? "+" : "−"}<BRL value={m.amount} />
                    </span>
                  </div>
                )) : <span className="text-caption text-faint">Sem transações neste dia.</span>}
              </div>
            );
          })()}
        </>
      )}
    </Card>
  );
}
