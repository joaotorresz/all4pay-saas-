"use client";

import * as React from "react";
import { Card, BRL, Skeleton } from "@/components/ui";
import { useRiscoInput } from "./hooks";
import { usePeriod } from "./PeriodContext";
import { WidgetHeader, EmptyState } from "./shared";
import { calcularLiquidezProjetada } from "@/core/risk-engine/liquidez.engine";
import type { RiskMovement } from "@/core/risk-engine/types";

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
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
  const { ano, mes } = usePeriod(); // mês global do header
  const hoje = data?.hoje ?? new Date().toISOString().slice(0, 10);
  const [diaSel, setDiaSel] = React.useState<string | null>(null);
  React.useEffect(() => { setDiaSel(null); }, [ano, mes]); // troca de mês limpa o dia

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

  const iso = (dia: number) => `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  const selInfo = diaSel ? porDia.get(diaSel) : null;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <WidgetHeader title="Calendário de transações" />
      </div>

      {isLoading && <Skeleton className="h-[280px] w-full" rounded="md" />}
      {isError && <EmptyState title="Não foi possível carregar o calendário" />}

      {!isLoading && !isError && (
        <>
          <div className="grid grid-cols-7 gap-[5px]">
            {WEEKDAYS.map((w) => (
              <span key={w} className="text-[11px] text-faint text-center pb-1">{w}</span>
            ))}
            {Array.from({ length: primeiroDiaSemana }).map((_, i) => <span key={`b${i}`} />)}
            {Array.from({ length: diasNoMes }).map((_, i) => {
              const dia = i + 1;
              const key = iso(dia);
              const info = porDia.get(key);
              const proj = projecao.get(key);
              const isHoje = key === hoje;
              const sel = key === diaSel;
              const temMov = !!(info?.entrada || info?.saida);
              const borda = proj?.ruptura
                ? "border-negative"
                : sel ? "border-ink ring-1 ring-ink" : "border-border-soft hover:border-border";
              return (
                <button
                  key={key}
                  onClick={() => setDiaSel(sel ? null : key)}
                  aria-label={`Dia ${dia}`}
                  className={[
                    "flex flex-col items-stretch gap-[3px] rounded-md border p-[5px] min-h-[58px] text-left transition-colors",
                    borda, sel ? "bg-surface-2" : temMov ? "bg-white hover:bg-surface-1" : "hover:bg-surface-1",
                  ].join(" ")}
                >
                  <span className="flex items-center justify-between">
                    <span className={["text-[16px] tabular-nums leading-none", isHoje ? "inline-flex items-center justify-center w-[26px] h-[26px] rounded-pill bg-lime text-on-lime" : "text-ink"].join(" ")}>{dia}</span>
                    <span className="flex items-center gap-[3px]">
                      {info?.entrada ? <span className="w-[6px] h-[6px] rounded-pill" style={{ background: POSITIVE }} /> : null}
                      {info?.saida ? <span className="w-[6px] h-[6px] rounded-pill" style={{ background: NEGATIVE }} /> : null}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Legenda */}
          <div className="flex items-center gap-4 text-[12px] text-faint flex-wrap">
            <span className="inline-flex items-center gap-[5px]"><span className="w-[6px] h-[6px] rounded-pill" style={{ background: POSITIVE }} />entradas</span>
            <span className="inline-flex items-center gap-[5px]"><span className="w-[6px] h-[6px] rounded-pill" style={{ background: NEGATIVE }} />saídas</span>
            {temRuptura && (
              <span className="inline-flex items-center gap-[5px]"><span className="inline-block w-3 h-3 rounded-[3px] border border-negative" />risco de ruptura</span>
            )}
          </div>

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
