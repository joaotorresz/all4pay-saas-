"use client";

import * as React from "react";
import Link from "next/link";
import { BRL, Card, Icon } from "@/components/ui";
import { useRiscoInput, useReceivables, usePayables, useQuantitativo } from "./hooks";
import { Resumo } from "./HomeQuatro";
import { dataDe, inadimplencia } from "@/core/indicadores";
import { painelFinanceiro } from "@/core/paineis";
import { pct } from "@/lib/format";
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import type { ReceivablesSummary } from "@/lib/types";

/**
 * A HOME DA PROPOSTA (canvas "Quattro · Home", outubro/2026).
 *
 * Três blocos numa grade de 12 colunas, com o MESMO espaço entre todos os
 * cards (a regra que o desenho fixou):
 *   1. Fluxo de caixa (8) + Saúde financeira (4)
 *   2. Calendário de transações (4) + Distribuição dos gastos (8)
 *   3. Operação: a receber · a pagar · vencidos (4 + 4 + 4)
 *   4. Transações recentes (12)
 *
 * ⚠️ Nenhum número nasce aqui. Fluxo de caixa é o `Resumo` (camada canônica),
 * a saúde é o `core/quant`, a distribuição é o `painelFinanceiro`, os cards de
 * operação são o `summarizeOpen` e o vencido é `inadimplencia` — as mesmas
 * funções que as telas de origem consultam.
 *
 * ⚠️ Número não tem cor por sinal (decisão de 30/09/2026): tudo em tinta, o
 * sinal escrito diz a direção. A única cor fora da paleta é o PONTO de alerta
 * do vencido, que é status, não número.
 */

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_LONGOS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Data-só fatiada da string — `new Date("YYYY-MM-DD")` cai no dia anterior em UTC−3. */
function partes(iso: string) {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return { ano: a, mes: m, dia: d };
}
const somaDias = (iso: string, n: number) => {
  const { ano, mes, dia } = partes(iso);
  return new Date(Date.UTC(ano, mes - 1, dia + n)).toISOString().slice(0, 10);
};
const diaDaSemana = (iso: string) => {
  const { ano, mes, dia } = partes(iso);
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
};
const nomeDe = (m: RiskMovement, input: RiskInput) =>
  (m.party_id ? input.partyNames?.[m.party_id] : null) ?? m.category ?? "Lançamento";

const CARD = "h-full flex flex-col gap-[18px]";

/* ------------------------------ saúde financeira ------------------------------ */

const ROTULO_SAUDE: Record<string, string> = {
  excelente: "excelente", saudavel: "boa", atencao: "atenção", risco: "em risco", critico: "crítica",
};

function SaudeFinanceira() {
  const { data, isLoading } = useQuantitativo();
  if (isLoading || !data) return <div className="rounded-card h-full min-h-[300px] animate-pulse" style={{ background: "var(--color-ink)" }} />;
  const { score, indicadores } = data;
  const nota = Math.round(score.score);
  const runway = indicadores.runwayMeses == null ? "—" : `${Math.round(indicadores.runwayMeses)} meses`;
  return (
    <section
      data-card="1"
      className="h-full flex flex-col gap-[18px] p-7"
      style={{ background: "var(--color-ink)", color: "var(--color-white)", borderRadius: "var(--a4p-box-radius)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-h2" style={{ color: "var(--color-white)" }}>Saúde financeira</h2>
        <span className="a4p-label" style={{ color: "var(--color-border)" }}>Últimos 90 dias</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="tabular-nums leading-none" style={{ fontSize: 39, fontWeight: 500 }}>{nota}</span>
        <span className="text-label" style={{ color: "var(--color-border)" }}>
          de 100 · {ROTULO_SAUDE[score.classificacao] ?? score.classificacao}
        </span>
      </div>
      <div className="h-[6px] rounded-pill overflow-hidden" style={{ background: "color-mix(in srgb, var(--color-white) 14%, transparent)" }}>
        <div className="h-full rounded-pill" style={{ width: `${Math.max(0, Math.min(100, nota))}%`, background: "var(--color-lime)" }} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Indice rotulo="Runway">{runway}</Indice>
        <Indice rotulo="Burn mensal"><BRL value={indicadores.burnRate} showDecimals={false} /></Indice>
        <Indice rotulo="Liquidez">{indicadores.liquidezCorrente.toFixed(1).replace(".", ",")}×</Indice>
        <Indice rotulo="Inadimplência">{pct(indicadores.inadimplencia)}</Indice>
      </div>
    </section>
  );
}

function Indice({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="a4p-label" style={{ color: "var(--color-border)" }}>{rotulo}</span>
      <span className="tabular-nums text-[18px] font-medium">{children}</span>
    </div>
  );
}

/* --------------------------- calendário de transações -------------------------- */

function Calendario({ input }: { input: RiskInput }) {
  const hoje = input.hoje.slice(0, 10);
  const [sel, setSel] = React.useState(hoje);
  const faixa = React.useMemo(() => Array.from({ length: 7 }, (_, i) => somaDias(hoje, i)), [hoje]);
  const doDia = React.useMemo(
    () => input.movements.filter((m) => m.status !== "cancelado" && m.due_date?.slice(0, 10) === sel).slice(0, 3),
    [input.movements, sel],
  );

  return (
    <Card className={CARD} info={{
      titulo: "Calendário de transações",
      oQue: "O que vence em cada um dos próximos sete dias.",
      comoCalcula: "Lançamentos agrupados pela data de VENCIMENTO — a data que responde “o que cai neste dia”.",
    }}>
      <h2 className="text-h2 m-0">Calendário de transações</h2>
      <div role="tablist" aria-label="Dias" className="flex-1 flex items-start justify-between gap-1">
        {faixa.map((d) => {
          const ativo = d === sel;
          return (
            <button
              key={d} role="tab" aria-selected={ativo} onClick={() => setSel(d)}
              className="flex-1 min-w-0 max-w-[40px] h-[73px] rounded-pill flex flex-col items-center justify-between pt-[7px] pb-[18px] transition-colors"
              style={{ background: ativo ? "var(--color-ink)" : "transparent" }}
            >
              <span
                className="w-full h-[29px] rounded-pill inline-flex items-center justify-center tabular-nums text-[12px] font-medium"
                style={{ background: ativo ? "var(--color-white)" : "transparent", color: "var(--color-ink)" }}
              >
                {partes(d).dia}
              </span>
              <span className="text-[12.5px] leading-none font-medium" style={{ color: ativo ? "var(--color-white)" : "var(--color-ink)" }}>
                {DIAS[diaDaSemana(d)]}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-2">
        {doDia.length === 0 ? (
          <p className="m-0 py-4 text-center text-caption text-muted">Nada agendado para este dia.</p>
        ) : doDia.map((m) => {
          const entrada = m.type === "entrada";
          const vencido = m.status === "pendente" && m.due_date.slice(0, 10) < hoje;
          return (
            <div key={m.id} className="flex items-center gap-3 bg-surface-2 px-4 py-[14px]" style={{ borderRadius: "var(--a4p-box-radius)" }}>
              <span className="w-9 h-9 rounded-pill bg-white inline-flex items-center justify-center shrink-0">
                <Icon name={entrada ? "arrow-up" : "arrow-down"} size={15} color="var(--color-ink)" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] text-ink truncate">{nomeDe(m, input)}</span>
                <span className="block text-caption text-muted truncate">{m.category ?? (entrada ? "Entrada" : "Saída")}</span>
              </span>
              <span className="text-caption text-muted shrink-0">{m.status === "pago" ? "Liquidado" : vencido ? "Vencido" : "Previsto"}</span>
              <span className="text-[15px] text-ink tabular-nums shrink-0 whitespace-nowrap">
                {entrada ? "+" : "−"}<BRL value={m.amount} />
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* --------------------------- distribuição dos gastos --------------------------- */

/** As fatias se distinguem por INTENSIDADE dentro da paleta, não por matizes avulsos. */
const CORES_FATIA = [
  "var(--color-ink)",
  "color-mix(in srgb, var(--color-ink) 72%, transparent)",
  "var(--color-areia)",
  "var(--color-border)",
  "var(--color-lime)",
];

function Distribuicao({ input }: { input: RiskInput }) {
  const mes = input.hoje.slice(0, 7);
  const { saidas, totalSaidas } = React.useMemo(() => painelFinanceiro(input, mes), [input, mes]);
  const fatias = React.useMemo(() => {
    const top = saidas.slice(0, 4);
    const resto = saidas.slice(4).reduce((s, f) => s + f.valor, 0);
    return resto > 0 ? [...top, { nome: "Outros", valor: resto }] : top;
  }, [saidas]);
  const { mes: m, ano } = partes(`${mes}-01`);

  let acumulado = 0;
  return (
    <Card className={CARD} info={{
      titulo: "Distribuição dos gastos",
      oQue: "Para onde foi o dinheiro que saiu neste mês, por categoria.",
      comoCalcula: "Saídas liquidadas no mês, pela data de pagamento, agrupadas pela categoria do lançamento. As quatro maiores aparecem; o restante soma em Outros.",
    }}>
      <div className="flex flex-col gap-1">
        <h2 className="text-h2 m-0">Distribuição dos gastos</h2>
        <span className="a4p-label text-muted">{MESES_LONGOS[m - 1]} {ano}</span>
      </div>
      {totalSaidas <= 0 ? (
        <p className="m-0 py-8 text-center text-caption text-muted">Nenhuma saída liquidada neste mês.</p>
      ) : (
        <div className="flex flex-col sm:flex-row items-center gap-8">
          <div role="img" aria-label={fatias.map((f) => `${f.nome} ${pct(f.valor / totalSaidas)}`).join(", ")} className="relative w-[168px] h-[168px] shrink-0">
            <svg viewBox="0 0 42 42" className="w-full h-full -rotate-90">
              <circle cx="21" cy="21" r="15.9" fill="none" stroke="var(--color-surface-2)" strokeWidth="5" />
              {fatias.map((f, i) => {
                const parte = (f.valor / totalSaidas) * 100;
                const el = (
                  <circle key={f.nome} cx="21" cy="21" r="15.9" fill="none" stroke={CORES_FATIA[i]} strokeWidth="5"
                    strokeDasharray={`${parte} ${100 - parte}`} strokeDashoffset={-acumulado} />
                );
                acumulado += parte;
                return el;
              })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-[2px]">
              <span className="a4p-label text-muted">Saídas</span>
              <span className="text-[14px] font-medium text-ink tabular-nums"><BRL value={totalSaidas} /></span>
            </div>
          </div>
          <ul className="m-0 p-0 list-none flex-1 w-full flex flex-col gap-[10px] text-[13px]">
            {fatias.map((f, i) => (
              <li key={f.nome} className="flex items-center gap-[10px]">
                <span className="w-2 h-2 rounded-[2px] shrink-0" style={{ background: CORES_FATIA[i] }} />
                <span className="flex-1 min-w-0 truncate text-ink">{f.nome}</span>
                <span className="tabular-nums text-muted">{pct(f.valor / totalSaidas)}</span>
                <span className="tabular-nums text-ink font-medium min-w-[96px] text-right"><BRL value={f.valor} /></span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

/* ----------------------------------- operação ---------------------------------- */

function CardOperacao({ rotulo, href, valor, rodape, alerta }: {
  rotulo: string; href: string; valor?: number; rodape: React.ReactNode; alerta?: boolean;
}) {
  return (
    <Link href={href} className="block h-full no-underline">
      <Card className={`${CARD} gap-[14px] hover:bg-surface-1 transition-colors`}>
        <span className="a4p-label text-muted inline-flex items-center gap-2">
          {rotulo}
          {alerta && <span aria-label="Atenção" className="w-[7px] h-[7px] rounded-pill" style={{ background: "var(--color-negative)" }} />}
        </span>
        <span className="text-[22px] font-medium text-ink leading-none tabular-nums">
          {valor == null ? "—" : <BRL value={valor} />}
        </span>
        <div className="mt-auto flex flex-wrap justify-between gap-2 text-caption text-muted border-t border-border pt-3">{rodape}</div>
      </Card>
    </Link>
  );
}

function Janela({ r }: { r?: ReceivablesSummary }) {
  return (
    <>
      <span>Essa semana <span className="text-ink font-medium tabular-nums">{r ? <BRL value={r.week} /> : "—"}</span></span>
      <span>Mês <span className="text-ink font-medium tabular-nums">{r ? <BRL value={r.month} /> : "—"}</span></span>
    </>
  );
}

function Operacao({ input }: { input: RiskInput }) {
  const rec = useReceivables().data;
  const pag = usePayables().data;
  const venc = React.useMemo(() => inadimplencia(input), [input]);
  const ids = new Set(venc.procedencia.movimentos ?? []);
  const clientes = new Set(input.movements.filter((m) => ids.has(m.id)).map((m) => m.party_id ?? m.id)).size;
  const titulos = venc.procedencia.lancamentos;
  return (
    <>
      <div className="lg:col-span-4">
        <CardOperacao rotulo="A receber · recebido hoje" href="/contas-a-receber" valor={rec?.today} rodape={<Janela r={rec} />} />
      </div>
      <div className="lg:col-span-4">
        <CardOperacao rotulo="A pagar · pago hoje" href="/contas-a-pagar" valor={pag?.today} rodape={<Janela r={pag} />} />
      </div>
      <div className="lg:col-span-4">
        <CardOperacao
          rotulo="Vencidos a receber" href="/dashboard/financial/overdue" valor={venc.valor} alerta={venc.valor > 0}
          rodape={<>
            <span className="tabular-nums">{titulos} {titulos === 1 ? "título" : "títulos"} · {clientes} {clientes === 1 ? "cliente" : "clientes"}</span>
            <span className="text-ink font-medium">Cobrar ↗</span>
          </>}
        />
      </div>
    </>
  );
}

/* ------------------------------ transações recentes ----------------------------- */

function Recentes({ input }: { input: RiskInput }) {
  const linhas = React.useMemo(() => {
    const caixa = (m: RiskMovement) => dataDe(m, "caixa");
    return input.movements
      .filter((m) => m.status !== "cancelado" && caixa(m))
      .sort((a, b) => (caixa(b) ?? "").localeCompare(caixa(a) ?? ""))
      .slice(0, 5)
      .map((m) => ({ m, dia: caixa(m) as string }));
  }, [input.movements]);

  return (
    <Card className={CARD} info={{
      titulo: "Transações recentes",
      oQue: "As últimas entradas e saídas já liquidadas, na ordem em que caíram no caixa.",
      comoCalcula: "Lançamentos pagos, ordenados pela data de pagamento, do mais recente ao mais antigo.",
    }}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-h2 m-0">Transações recentes</h2>
        <Link href="/dashboard/financial/statement" className="text-caption font-medium text-ink">Ver extrato ↗</Link>
      </div>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Transações recentes">
        <table className="w-full min-w-[520px] border-collapse text-[14px]">
          <thead>
            <tr className="a4p-label text-muted text-left">
              <th className="pb-[10px] font-medium">Dia</th>
              <th className="pb-[10px] font-medium">Contraparte</th>
              <th className="pb-[10px] font-medium">Categoria</th>
              <th className="pb-[10px] font-medium text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ m, dia }) => {
              const entrada = m.type === "entrada";
              const { dia: d, mes } = partes(dia);
              return (
                <tr key={m.id} className="border-t border-border">
                  <td className="py-[14px] text-muted tabular-nums">{String(d).padStart(2, "0")} {MESES[mes - 1].toLowerCase()}</td>
                  <td className="py-[14px] font-medium text-ink">
                    {m.party_id ? (
                      <button type="button" className="text-left hover:underline"
                        onClick={() => window.dispatchEvent(new CustomEvent("a4p:open-contato", { detail: { id: m.party_id } }))}>
                        {nomeDe(m, input)}
                      </button>
                    ) : nomeDe(m, input)}
                  </td>
                  <td className="py-[14px]"><span className="text-[12px] px-[10px] py-[3px] rounded-pill bg-surface-2 text-ink">{m.category ?? "—"}</span></td>
                  <td className="py-[14px] text-right font-medium text-ink tabular-nums whitespace-nowrap">{entrada ? "+" : "−"}<BRL value={m.amount} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {linhas.length === 0 && <p className="m-0 py-8 text-center text-caption text-muted">Nenhuma transação liquidada ainda.</p>}
      </div>
    </Card>
  );
}

/* ------------------------------------ a Home ----------------------------------- */

export function HomeProposta() {
  const { data: input, isLoading } = useRiscoInput();

  if (isLoading || !input) {
    return (
      <div className="grid gap-4 lg:grid-cols-12">
        {["lg:col-span-8", "lg:col-span-4", "lg:col-span-4", "lg:col-span-8"].map((c, i) => (
          <div key={i} className={`rounded-card bg-white h-[320px] animate-pulse ${c}`} data-card="1" />
        ))}
      </div>
    );
  }

  return (
    <div className="a4p-home flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8 min-w-0"><Resumo input={input} titulo="Fluxo de caixa" className="h-full" /></div>
        <div className="lg:col-span-4 min-w-0"><SaudeFinanceira /></div>
        <div className="lg:col-span-4 min-w-0"><Calendario input={input} /></div>
        <div className="lg:col-span-8 min-w-0"><Distribuicao input={input} /></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-12"><Operacao input={input} /></div>
      <Recentes input={input} />
    </div>
  );
}
