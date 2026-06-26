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
  const { ano, mes, futuro } = usePeriod(); // mês global do header
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
        <WidgetHeader title={futuro ? "Calendário · projeção" : "Calendário de transações"} />
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
              // DS limpo: células planas em surface-2, sem grade de bordas; ring
              // só no selecionado / risco de ruptura.
              const estado = proj?.ruptura
                ? "ring-1 ring-negative bg-surface-2"
                : sel ? "ring-1 ring-ink bg-surface-2" : "bg-surface-2 hover:bg-surface-3";
              return (
                <button
                  key={key}
                  onClick={() => setDiaSel(sel ? null : key)}
                  aria-label={`Dia ${dia}`}
                  className={["flex flex-col items-center justify-center gap-[6px] rounded-md p-[6px] min-h-[62px] transition-colors", estado].join(" ")}
                >
                  <span data-day-num className={["text-[15px] tabular-nums leading-none font-medium", isHoje ? "inline-flex items-center justify-center w-[24px] h-[24px] rounded-pill bg-lime text-on-lime" : "text-ink"].join(" ")}>{dia}</span>
                  {/* Gráfico circular proporcional entrada (verde) × saída (vermelho) do dia. */}
                  <DayRing entrada={info?.entrada ?? 0} saida={info?.saida ?? 0} />
                </button>
              );
            })}
          </div>

          {/* Legenda */}
          <div className="flex items-center gap-4 text-[12px] text-faint flex-wrap">
            <span className="inline-flex items-center gap-[5px]"><span className="w-[8px] h-[8px] rounded-pill" style={{ background: POSITIVE }} />entradas</span>
            <span className="inline-flex items-center gap-[5px]"><span className="w-[8px] h-[8px] rounded-pill" style={{ background: NEGATIVE }} />saídas</span>
            {temRuptura && (
              <span className="inline-flex items-center gap-[5px]"><span className="inline-block w-3 h-3 rounded-[3px] border border-negative" />risco de ruptura</span>
            )}
          </div>

          {diaSel && (() => {
            const futuro = diaSel > hoje;
            // Futuro → saldo ESPERADO (projeção). Hoje/passado → saldo TOTAL
            // realizado: saldo atual menos o net liquidado APÓS o dia (até hoje).
            const proj = projecao.get(diaSel);
            let valor: number | undefined;
            let ruptura = false;
            if (futuro) {
              valor = proj?.saldo;
              ruptura = !!proj?.ruptura;
            } else {
              let netDepois = 0;
              for (const m of data?.movements ?? []) {
                if (m.status !== "pago") continue;
                const pd = m.paid_date ?? m.due_date;
                if (pd > diaSel && pd <= hoje) netDepois += m.type === "entrada" ? m.amount : -m.amount;
              }
              valor = (data?.saldoAtual ?? 0) - netDepois;
              ruptura = valor < 0;
            }
            const rotulo = futuro ? "Saldo esperado" : "Saldo total";
            return (
              <div className={["flex flex-col gap-2 rounded-md border p-3", ruptura ? "border-negative" : "border-border-soft"].join(" ")}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-caption font-medium text-muted">{diaSel.split("-").reverse().join("/")}</span>
                  {valor != null && (
                    <span className="text-caption tabular-nums text-muted">
                      {rotulo}: <span className="text-ink font-medium">{valor < 0 ? "−" : ""}<BRL value={Math.abs(valor)} /></span>
                    </span>
                  )}
                </div>
                {selInfo?.itens.length ? selInfo.itens.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-3 text-caption">
                    <span className="text-ink truncate flex-1 inline-flex items-center gap-2">
                      <span className="w-[7px] h-[7px] rounded-pill shrink-0" style={{ background: m.type === "entrada" ? POSITIVE : NEGATIVE }} />
                      {m.category || (m.type === "entrada" ? "Entrada" : "Saída")}
                    </span>
                    {/* número sempre preto (ink); o sinal +/− e o dot indicam o tipo */}
                    <span className="tabular-nums text-ink font-medium">
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

/** Anel proporcional entrada (verde) × saída (vermelho) do dia. Vazio → reserva
 *  a altura para manter os dias alinhados. Pontas arredondadas, traço fino. */
function DayRing({ entrada, saida, size = 22 }: { entrada: number; saida: number; size?: number }) {
  const total = entrada + saida;
  if (total <= 0) return <span className="block" style={{ height: size }} aria-hidden />;
  const sw = 3;
  const r = (size - sw) / 2;
  const cx = size / 2;
  const C = 2 * Math.PI * r;
  const entLen = (entrada / total) * C;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <g transform={`rotate(-90 ${cx} ${cx})`} fill="none" strokeWidth={sw} strokeLinecap="round">
        {saida > 0 && <circle cx={cx} cy={cx} r={r} stroke="var(--color-negative)" strokeDasharray={`${C} ${C}`} />}
        {entrada > 0 && <circle cx={cx} cy={cx} r={r} stroke="var(--color-positive)" strokeDasharray={`${entLen} ${C}`} />}
      </g>
    </svg>
  );
}
