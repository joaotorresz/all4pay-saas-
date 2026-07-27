"use client";

import * as React from "react";
import Link from "next/link";
import { Card, BRL, Skeleton } from "@/components/ui";
import { useRiscoInput } from "./hooks";
import { usePeriod } from "./PeriodContext";
import { EmptyState } from "./shared";
import { calcularLiquidezProjetada } from "@/core/risk-engine/liquidez.engine";
import type { RiskMovement } from "@/core/risk-engine/types";

/** Iniciais das linhas (a grade é TRANSPOSTA: linha = dia da semana). */
const WEEK_INITIALS = ["D", "S", "T", "Q", "Q", "S", "S"];
const POSITIVE = "var(--color-positive)";
const NEGATIVE = "var(--color-negative)";

/** Data que "conta" para o calendário: pago → paid_date; senão → vencimento. */
const diaDoMovimento = (m: RiskMovement) =>
  (m.status === "pago" ? m.paid_date || m.due_date : m.due_date).slice(0, 10);

interface DiaInfo { entrada: number; saida: number; itens: RiskMovement[] }

/* ----------------------------- ESCALA DE COR -----------------------------
 * O modelo de referência usa uma rampa "menos → mais" de UMA cor. Aqui a
 * lógica é a do calendário de transações: **verde para entradas, vermelho
 * para saídas** — uma escala DIVERGENTE sobre o líquido do dia
 * (entradas − saídas). A intensidade continua sendo o tamanho do valor.
 */
const MISTURA = [0, 16, 34, 58, 100]; // % da cor em cada nível

/** Nível 0–4 pelo peso do líquido do dia contra o maior líquido do mês. */
function nivelDe(net: number, maxAbs: number): number {
  if (!maxAbs || net === 0) return 0;
  const r = Math.abs(net) / maxAbs;
  return r > 0.66 ? 4 : r > 0.33 ? 3 : r > 0.12 ? 2 : 1;
}

/** Fundo da célula: neutro no nível 0, senão a cor do sinal diluída. */
function fundoDe(net: number, nivel: number): string {
  if (nivel === 0) return "color-mix(in srgb, var(--color-surface-2) 55%, transparent)";
  const cor = net > 0 ? POSITIVE : NEGATIVE;
  return `color-mix(in srgb, ${cor} ${MISTURA[nivel]}%, transparent)`;
}

/** Texto da célula: branco só no nível cheio (verde e vermelho do DS são
 *  escuros o bastante ali); ink nos intermediários, faint no dia sem movimento. */
function textoDe(nivel: number): string {
  if (nivel === 0) return "var(--color-text-tertiary)";
  if (nivel === 4) return "#fff";
  return "var(--color-ink)";
}

/**
 * Calendário de transações — **mapa de calor** no modelo da referência:
 * valor-herói + média diária, grade TRANSPOSTA (linhas = dias da semana,
 * colunas = semanas do mês), legenda e o destaque do maior gasto no rodapé.
 * Clicar num dia abre a lista daquele dia. Mês vem do período global.
 * Demo-safe.
 */
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
  const semanas = Math.ceil((primeiroDiaSemana + diasNoMes) / 7);

  const iso = (dia: number) => `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  const selInfo = diaSel ? porDia.get(diaSel) : null;

  // Números do topo e do rodapé — todos derivados do MESMO mapa por dia.
  const resumo = React.useMemo(() => {
    let entradas = 0, saidas = 0, maxAbs = 0;
    let maiorGasto = 0, diaMaiorGasto = 0;
    for (const [dia, info] of Array.from(porDia.entries())) {
      entradas += info.entrada;
      saidas += info.saida;
      maxAbs = Math.max(maxAbs, Math.abs(info.entrada - info.saida));
      if (info.saida > maiorGasto) { maiorGasto = info.saida; diaMaiorGasto = Number(dia.slice(8, 10)); }
    }
    const resultado = entradas - saidas;
    // Média diária: no mês corrente divide pelos dias JÁ decorridos (senão a
    // média de um mês pela metade sai artificialmente baixa).
    const mesCorrente = hoje.startsWith(`${ano}-${String(mes + 1).padStart(2, "0")}`);
    const dias = mesCorrente ? Math.max(1, Number(hoje.slice(8, 10))) : diasNoMes;
    return { entradas, saidas, resultado, media: resultado / dias, maxAbs, maiorGasto, diaMaiorGasto };
  }, [porDia, hoje, ano, mes, diasNoMes]);

  return (
    <Card
      className="flex flex-col gap-4"
      info={{
        titulo: "Calendário de transações",
        oQue: "Mapa de calor do mês: cada dia é uma célula colorida pelo líquido (entradas − saídas), para enxergar de relance onde o caixa sobra e onde aperta.",
        comoCalcula: "Cada movimento cai no dia do pagamento (ou do vencimento, se pendente). A cor sai do LÍQUIDO do dia — verde quando entrou mais do que saiu, vermelho no contrário — e a intensidade é o tamanho desse líquido contra o maior do mês. O valor do topo é o resultado do mês; a média diária divide pelos dias decorridos.",
      }}
    >
      {/* Topo — micro-label + atalho, no modelo da referência */}
      <div className="flex items-start justify-between gap-3">
        <span className="text-[13px] font-medium uppercase tracking-[0.06em] text-faint">
          {futuro ? "Calendário · projeção" : "Calendário de transações"}
        </span>
        <Link
          href="/fluxo-caixa"
          className="inline-flex items-center gap-1 text-[13px] font-medium shrink-0 hover:underline"
          style={{ color: POSITIVE }}
        >
          ver mais ↗
        </Link>
      </div>

      {isLoading && <Skeleton className="h-[300px] w-full" rounded="md" />}
      {isError && <EmptyState title="Não foi possível carregar o calendário" />}

      {!isLoading && !isError && (
        <>
          {/* Herói — resultado do mês + média diária */}
          <div className="flex flex-col gap-[6px]">
            <span className="a4p-heroi text-[34px] font-bold leading-none text-ink tabular-nums">
              {resumo.resultado < 0 ? "−" : ""}<BRL value={Math.abs(resumo.resultado)} />
            </span>
            <span className="text-[15px] text-muted">
              Média diária: <span className="text-ink font-medium">{resumo.media < 0 ? "−" : ""}<BRL value={Math.abs(resumo.media)} /></span>
            </span>
          </div>

          {/* Grade TRANSPOSTA: linha = dia da semana · coluna = semana do mês */}
          <div
            className="grid gap-[6px]"
            style={{ gridTemplateColumns: `20px repeat(${semanas}, minmax(0, 1fr))` }}
          >
            {WEEK_INITIALS.map((letra, wd) => (
              <React.Fragment key={wd}>
                <span className="text-[13px] text-faint self-center">{letra}</span>
                {Array.from({ length: semanas }).map((_, col) => {
                  const dia = col * 7 + wd - primeiroDiaSemana + 1;
                  if (dia < 1 || dia > diasNoMes) return <span key={`${wd}-${col}`} />;
                  const key = iso(dia);
                  const info = porDia.get(key);
                  const net = (info?.entrada ?? 0) - (info?.saida ?? 0);
                  const nivel = nivelDe(net, resumo.maxAbs);
                  const risco = !!projecao.get(key)?.ruptura; // possível saldo negativo
                  const sel = key === diaSel;
                  const isHoje = key === hoje;
                  return (
                    <button
                      key={key}
                      onClick={() => setDiaSel(sel ? null : key)}
                      aria-label={`Dia ${dia}${risco ? " · possível saldo negativo" : ""}`}
                      title={info ? `Dia ${dia} · líquido ${net < 0 ? "−" : "+"}${Math.abs(net).toFixed(2)}` : `Dia ${dia}`}
                      className={[
                        "flex items-center justify-center rounded-md h-[38px] transition-[filter,box-shadow] hover:brightness-95",
                        sel ? "ring-1 ring-ink" : risco ? "ring-1 ring-negative" : "",
                      ].join(" ")}
                      style={{ background: fundoDe(net, nivel) }}
                    >
                      <span
                        data-day-num
                        className={["tabular-nums leading-none text-[15px]", isHoje ? "font-bold" : "font-medium"].join(" ")}
                        style={{ color: textoDe(nivel) }}
                      >
                        {dia}
                      </span>
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
          </div>

          {/* Legenda — DIVERGENTE (verde ↔ vermelho), no lugar do "menos → mais" */}
          <div className="flex items-center justify-between gap-3 text-[13px] text-muted">
            <span>Entradas</span>
            <span className="inline-flex items-center gap-[5px]">
              {[4, 3, 2].map((n) => (
                <span key={`p${n}`} className="w-[14px] h-[14px] rounded-sm" style={{ background: fundoDe(1, n) }} />
              ))}
              <span className="w-[14px] h-[14px] rounded-sm" style={{ background: fundoDe(0, 0) }} />
              {[2, 3, 4].map((n) => (
                <span key={`n${n}`} className="w-[14px] h-[14px] rounded-sm" style={{ background: fundoDe(-1, n) }} />
              ))}
            </span>
            <span>Saídas</span>
          </div>
          {temRuptura && (
            <span className="text-[12px] text-faint -mt-2">
              Dias com contorno vermelho têm risco de saldo negativo.
            </span>
          )}

          {/* Rodapé — o maior gasto do mês, como na referência */}
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-border-soft">
            <span className="text-[15px] text-muted">Maior gasto</span>
            <span className="text-[15px] tabular-nums">
              <span className="font-medium" style={{ color: NEGATIVE }}><BRL value={resumo.maiorGasto} /></span>
              {resumo.diaMaiorGasto > 0 && <span className="text-faint"> dia {resumo.diaMaiorGasto}</span>}
            </span>
          </div>

          {diaSel && (() => {
            const ehFuturo = diaSel > hoje;
            // Futuro → saldo ESPERADO (projeção). Hoje/passado → saldo TOTAL
            // realizado: saldo atual menos o net liquidado APÓS o dia (até hoje).
            const proj = projecao.get(diaSel);
            let valor: number | undefined;
            let ruptura = false;
            if (ehFuturo) {
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
            const rotulo = ehFuturo ? "Saldo esperado" : "Saldo total";
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
