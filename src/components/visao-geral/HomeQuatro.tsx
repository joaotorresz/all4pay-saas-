"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Card, Icon, BRL, type IconName } from "@/components/ui";
import { useRiscoInput } from "./hooks";
import { chartAnim } from "@/lib/chart-anim";
import {
  entradas as entradasDe,
  saidas as saidasDe,
  resultado as resultadoDe,
  saldo as saldoDe,
  janelaDoMesDe,
  janelaMes,
} from "@/core/indicadores";
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";

/**
 * A HOME EM QUATRO CARDS.
 *
 * A organização é a da referência: em cima, RESUMO (barras dos três meses +
 * o valor do mês e três leituras ao lado) e CALENDÁRIO DE TRANSAÇÕES (a
 * faixa de dias e a agenda do dia); embaixo, DICAS ALL4PAY num bloco escuro
 * e TRANSAÇÕES RECENTES em tabela.
 *
 * ⚠️ Nenhum número sai daqui. Todos vêm de `core/indicadores` — a mesma
 * camada que o DRE, o fluxo de caixa e a IA consultam. A guarda de teto ZERO
 * ("nenhuma tela soma lançamentos por conta própria") existe porque cada tela
 * somando do seu jeito é como o sistema passou a responder a mesma pergunta
 * com números diferentes conforme a página.
 */

/* ------------------------------- utilidades ------------------------------- */

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** Data-só fatiada da string — `new Date("YYYY-MM-DD")` cai no dia anterior em UTC−3. */
function partes(iso: string) {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return { ano: a, mes: m, dia: d };
}
const somaDias = (iso: string, n: number) => {
  const { ano, mes, dia } = partes(iso);
  const d = new Date(Date.UTC(ano, mes - 1, dia + n));
  return d.toISOString().slice(0, 10);
};
const diaDaSemana = (iso: string) => {
  const { ano, mes, dia } = partes(iso);
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
};

/* --------------------------------- resumo -------------------------------- */

interface Mes { rotulo: string; entradas: number; saidas: number }

function tresMeses(input: RiskInput): Mes[] {
  const { ano, mes } = partes(input.hoje);
  const out: Mes[] = [];
  for (let k = 2; k >= 0; k--) {
    const m = mes - k;
    const a = ano + Math.floor((m - 1) / 12);
    const mm = ((m - 1) % 12 + 12) % 12;
    // ⚠️ `janelaMes` recebe o mês 0-BASED (como `Date.getMonth()`), e está
    // documentado assim — todos os outros chamadores passam `getMonth()`.
    // Com `mm + 1` cada barra mostrava o mês SEGUINTE: agosto caía em
    // setembro, que ainda não aconteceu, e a terceira coluna saía vazia ao
    // lado de um "entradas do mês" de R$ 607 mil. O gráfico não parecia
    // quebrado — parecia um mês fraco, que é o pior tipo de erro num número.
    const j = janelaMes(a, mm);
    out.push({
      rotulo: MESES[mm],
      entradas: entradasDe(input, j).valor,
      saidas: saidasDe(input, j).valor,
    });
  }
  return out;
}

function Resumo({ input }: { input: RiskInput }) {
  const meses = React.useMemo(() => tresMeses(input), [input]);
  const jMes = janelaDoMesDe(input.hoje);
  const saldoAtual = saldoDe(input).valor;
  const ent = entradasDe(input, jMes).valor;
  const sai = saidasDe(input, jMes).valor;
  const res = resultadoDe(input, jMes).valor;

  const dados = meses.map((m) => ({ nome: m.rotulo, entradas: m.entradas, saidas: m.saidas }));
  const ultimo = meses[meses.length - 1];

  return (
    <Card
      className="flex flex-col lg:flex-row gap-6"
      info={{
        titulo: "Resumo",
        oQue: "O caixa dos três últimos meses e a posição do mês corrente.",
        comoCalcula:
          "Barras: entradas e saídas liquidadas de cada mês, pela data de pagamento. Saldo: o saldo das contas hoje. Tudo pela camada canônica de indicadores.",
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-h2 m-0">Resumo</h2>
          <span className="a4p-label text-muted bg-surface-2 rounded-pill px-3 py-[6px] inline-flex items-center gap-[6px] shrink-0">
            <Icon name="calendar" size={13} color="var(--color-text-secondary)" />
            {meses[0].rotulo} – {ultimo.rotulo}
          </span>
        </div>

        <div className="h-[210px] mt-5" role="img"
          aria-label={`Entradas e saídas dos meses ${meses.map((m) => m.rotulo).join(", ")}.`}>
          <ResponsiveContainer width="100%" height="100%">
            {/* Velas EMPILHADAS: a altura da coluna passa a ser o movimento
                total do mês, e a divisão interna mostra quanto dele foi
                entrada e quanto foi saída. Lado a lado, a comparação era
                entre duas colunas; empilhado, ela é dentro da mesma. */}
            <BarChart data={dados} margin={{ top: 24, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="nome" axisLine={false} tickLine={false} tickMargin={10}
                tick={{ fill: "var(--color-text-secondary)" }} />
              <Tooltip content={<ResumoTooltip />} cursor={{ fill: "var(--color-surface-2)", radius: 12 }} />
              {/* O raio arredonda só a ponta EXPOSTA de cada pedaço: o de baixo
                  na base, o de cima no topo. Arredondar os quatro cantos dos
                  dois abriria uma fresta na emenda e a pilha deixaria de ler
                  como uma coluna só. */}
              <Bar dataKey="saidas" stackId="mes" radius={[0, 0, 10, 10]} maxBarSize={56}
                fill="var(--a4p-cat-3)" {...chartAnim()} />
              <Bar dataKey="entradas" stackId="mes" radius={[10, 10, 0, 0]} maxBarSize={56}
                fill="var(--a4p-cat-1)" {...chartAnim(120)} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-5 mt-2">
          <Legenda cor="var(--a4p-cat-1)" nome="Entradas" />
          <Legenda cor="var(--a4p-cat-3)" nome="Saídas" />
        </div>
      </div>

      {/* A coluna de leituras da referência: rótulo com glifo, valor-herói em
          cima e três linhas embaixo, cada uma com a sua variação. */}
      <div className="lg:w-[280px] shrink-0 lg:border-l border-border-soft lg:pl-6">
        <span className="a4p-label text-muted inline-flex items-center gap-[6px]">
          <Icon name="trending-up" size={13} color="var(--color-text-secondary)" />
          Saldo atual deste mês
        </span>
        <div className="a4p-heroi mt-2 tabular-nums leading-none">
          <BRL value={saldoAtual} />
        </div>
        <div className="mt-5 flex flex-col">
          <Leitura icone="arrow-up" nome="Entradas do mês" valor={ent} />
          <Leitura icone="arrow-down-to-line" nome="Saídas do mês" valor={sai} />
          <Leitura icone="activity" nome="Resultado do mês" valor={res} ultimo />
        </div>
      </div>
    </Card>
  );
}

function ResumoTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const de = (k: string) => payload.find((p) => p.dataKey === k)?.value ?? 0;
  const ent = de("entradas");
  const sai = de("saidas");
  return (
    <div className="rounded-card bg-white shadow-popover px-4 py-3 min-w-[190px]">
      <span className="a4p-label text-muted">{label}</span>
      <div className="mt-2 flex flex-col gap-[6px]">
        <LinhaTip cor="var(--a4p-cat-1)" nome="Entradas" valor={ent} />
        <LinhaTip cor="var(--a4p-cat-3)" nome="Saídas" valor={sai} />
        <span className="border-t border-border-soft pt-[6px] flex items-center justify-between gap-4">
          <span className="text-caption text-muted">Resultado</span>
          <span className="text-caption text-ink tabular-nums"><BRL value={ent - sai} showDecimals={false} /></span>
        </span>
      </div>
    </div>
  );
}

function LinhaTip({ cor, nome, valor }: { cor: string; nome: string; valor: number }) {
  return (
    <span className="flex items-center justify-between gap-4">
      <span className="inline-flex items-center gap-2 text-caption text-muted">
        <span className="w-[7px] h-[7px] rounded-pill shrink-0" style={{ background: cor }} />
        {nome}
      </span>
      <span className="text-caption text-ink tabular-nums"><BRL value={valor} showDecimals={false} /></span>
    </span>
  );
}

function Legenda({ cor, nome }: { cor: string; nome: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-caption text-muted">
      <span className="w-[7px] h-[7px] rounded-pill" style={{ background: cor }} />
      {nome}
    </span>
  );
}

function Leitura({ icone, nome, valor, ultimo }: { icone: IconName; nome: string; valor: number; ultimo?: boolean }) {
  return (
    <div className={`flex items-center gap-3 py-[14px] ${ultimo ? "" : "border-b border-border-soft"}`}>
      <Icon name={icone} size={15} color="var(--color-text-secondary)" />
      <span className="text-label text-ink flex-1 min-w-0 truncate">{nome}</span>
      <span className="text-label tabular-nums text-ink shrink-0"><BRL value={valor} showDecimals={false} /></span>
    </div>
  );
}

/* ---------------------------- calendário do dia --------------------------- */

function Calendario({ input }: { input: RiskInput }) {
  const [sel, setSel] = React.useState(input.hoje.slice(0, 10));
  // A faixa começa no dia de hoje, como na referência: o passado não é agenda.
  const faixa = React.useMemo(
    () => Array.from({ length: 7 }, (_, i) => somaDias(input.hoje.slice(0, 10), i)),
    [input.hoje],
  );

  const doDia = React.useMemo(
    () => input.movements.filter((m) => m.due_date?.slice(0, 10) === sel).slice(0, 4),
    [input.movements, sel],
  );

  return (
    <Card
      info={{
        titulo: "Calendário de transações",
        oQue: "O que vence em cada dia dos próximos sete.",
        comoCalcula: "Lançamentos agrupados pela data de VENCIMENTO — a data que responde “o que cai neste dia”.",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-h2 m-0">Calendário de transações</h2>
        <button
          onClick={() => window.dispatchEvent(new Event("a4p:criar"))}
          aria-label="Novo lançamento"
          className="shrink-0 w-8 h-8 rounded-pill bg-surface-2 hover:bg-surface-3 inline-flex items-center justify-center">
          <Icon name="plus" size={16} color="var(--color-ink)" />
        </button>
      </div>

      {/* A faixa de dias da referência: número grande, dia da semana embaixo,
          e o selecionado num pill escuro. */}
      <div className="flex items-stretch gap-1 mt-5 overflow-x-auto a4p-nav-scroll" role="tablist"
        aria-label="Dias">
        {faixa.map((d, i) => {
          const ativo = d === sel;
          return (
            <React.Fragment key={d}>
              {i > 0 && <span aria-hidden className="w-px bg-border-soft my-3" />}
              <button role="tab" aria-selected={ativo} onClick={() => setSel(d)}
                className={`flex-1 min-w-[46px] rounded-pill py-2 flex flex-col items-center gap-[2px] transition-colors ${
                  ativo ? "bg-ink text-white" : "hover:bg-surface-2"
                }`}>
                <span className={`text-label tabular-nums leading-none ${ativo ? "" : "text-ink"}`}>
                  {partes(d).dia}
                </span>
                <span className={`a4p-label ${ativo ? "" : "text-muted"}`}>{DIAS[diaDaSemana(d)]}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {doDia.length === 0 ? (
          <p className="m-0 py-8 text-center text-caption text-muted">Nada agendado para este dia.</p>
        ) : (
          doDia.map((m) => <LinhaAgenda key={m.id} m={m} input={input} />)
        )}
      </div>
    </Card>
  );
}

function LinhaAgenda({ m, input }: { m: RiskMovement; input: RiskInput }) {
  const nome = (m.party_id ? input.partyNames?.[m.party_id] : null) ?? m.category ?? "Lançamento";
  const entrada = m.type === "entrada";
  // A "prioridade" da referência traduzida para o que importa aqui: o estado
  // do título. Vencido é o único que exige ação hoje.
  const vencido = m.status === "pendente" && m.due_date.slice(0, 10) < input.hoje.slice(0, 10);
  const estado = m.status === "pago" ? "Liquidado" : vencido ? "Vencido" : "Previsto";
  return (
    <div className="flex items-center gap-3 rounded-card bg-surface-2 px-4 py-3">
      <span className="w-9 h-9 rounded-pill bg-white inline-flex items-center justify-center shrink-0">
        <Icon name={entrada ? "arrow-up" : "arrow-down-to-line"} size={15} color="var(--color-ink)" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-label text-ink truncate">{nome}</span>
        <span className="block text-caption text-muted truncate">{m.category ?? (entrada ? "Entrada" : "Saída")}</span>
      </span>
      <span className="a4p-label text-muted shrink-0">{estado}</span>
      <span className="text-label tabular-nums text-ink shrink-0">
        <BRL value={m.amount} showDecimals={false} />
      </span>
    </div>
  );
}

/* ------------------------------ dicas all4pay ----------------------------- */

const SUGESTOES: { icone: IconName; texto: string }[] = [
  { icone: "trending-up", texto: "Como está meu caixa?" },
  { icone: "mail", texto: "Quem está me devendo?" },
  { icone: "receipt", texto: "Quanto vou pagar de imposto?" },
];

function Dicas() {
  return (
    // O bloco escuro da referência. É o único card de fundo escuro da Home —
    // o contraste é o que o faz ler como uma peça de outra natureza (a IA), e
    // não como mais um card de dado.
    <div className="rounded-card bg-ink p-5 flex flex-col" data-card="1"
      style={{ background: "var(--color-ink)" }}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-h2 m-0" style={{ color: "var(--a4p-chrome-ink)" }}>Dicas all4pay</h2>
        <span className="flex items-center gap-2">
          <BotaoEscuro icone="sparkles" rotulo="Sugestões da IA" />
          <BotaoEscuro icone="arrow-up-right" rotulo="Abrir o assistente"
            onClick={() => window.dispatchEvent(new Event("a4p:open-ia"))} />
        </span>
      </div>

      <div className="mt-4 rounded-card p-4 flex-1 flex flex-col" style={{ background: "var(--a4p-chrome-field)" }}>
        <div className="flex flex-col gap-2 items-start">
          {SUGESTOES.map((s) => (
            <button key={s.texto}
              onClick={() => window.dispatchEvent(new CustomEvent("a4p:ia-perguntar", { detail: { texto: s.texto } }))}
              className="inline-flex items-center gap-2 rounded-pill pl-1 pr-4 py-1 transition-opacity hover:opacity-80"
              style={{ background: "var(--a4p-chrome-field-hover)" }}>
              <span className="w-7 h-7 rounded-pill inline-flex items-center justify-center shrink-0"
                style={{ background: "var(--color-lime)" }}>
                <Icon name={s.icone} size={14} color="var(--color-on-lime)" />
              </span>
              <span className="text-caption" style={{ color: "var(--a4p-chrome-ink)" }}>{s.texto}</span>
            </button>
          ))}
        </div>
        <div className="mt-auto pt-5 flex items-center gap-2">
          <span className="text-caption flex-1" style={{ color: "var(--a4p-chrome-mut)" }}>Pergunte qualquer coisa…</span>
          <button onClick={() => window.dispatchEvent(new Event("a4p:open-ia"))}
            aria-label="Perguntar ao All 4 Pay AI"
            className="w-8 h-8 rounded-pill inline-flex items-center justify-center shrink-0"
            style={{ background: "var(--color-lime)" }}>
            <Icon name="arrow-up" size={15} color="var(--color-on-lime)" />
          </button>
        </div>
      </div>
    </div>
  );
}

function BotaoEscuro({ icone, rotulo, onClick }: { icone: IconName; rotulo: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} aria-label={rotulo} title={rotulo}
      className="w-8 h-8 rounded-pill inline-flex items-center justify-center"
      style={{ background: "var(--a4p-chrome-field)" }}>
      <Icon name={icone} size={15} color="var(--a4p-chrome-ink)" />
    </button>
  );
}

/* --------------------------- transações recentes -------------------------- */

function Recentes({ input }: { input: RiskInput }) {
  const router = useRouter();
  const [busca, setBusca] = React.useState("");

  const linhas = React.useMemo(() => {
    const nomeDe = (m: RiskMovement) =>
      (m.party_id ? input.partyNames?.[m.party_id] : null) ?? m.category ?? "Lançamento";
    return input.movements
      .filter((m) => m.status !== "cancelado")
      .slice()
      .sort((a, b) => (b.paid_date ?? b.due_date).localeCompare(a.paid_date ?? a.due_date))
      .filter((m) => !busca || nomeDe(m).toLowerCase().includes(busca.toLowerCase()))
      .slice(0, 6)
      .map((m) => ({ m, nome: nomeDe(m) }));
  }, [input.movements, input.partyNames, busca]);

  return (
    <Card
      info={{
        titulo: "Transações recentes",
        oQue: "As últimas movimentações, entradas e saídas juntas.",
        comoCalcula: "Lançamentos não cancelados, ordenados pela data de caixa (pagamento quando liquidado, vencimento quando previsto).",
      }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-h2 m-0">Transações recentes</h2>
        <label className="inline-flex items-center gap-2 rounded-pill bg-surface-2 px-4 h-9 min-w-[190px]">
          <Icon name="search" size={14} color="var(--color-text-secondary)" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar aqui" aria-label="Buscar transação"
            className="bg-transparent border-0 outline-none text-caption text-ink w-full placeholder:text-placeholder" />
        </label>
      </div>

      <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Transações recentes">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {["Contraparte", "Tipo", "Categoria", "Data", "Valor", "Situação"].map((c, i) => (
                <th key={c} className={`a4p-label text-muted font-medium pb-3 ${i > 3 ? "text-right" : "text-left"}`}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ m, nome }) => {
              const entrada = m.type === "entrada";
              const data = (m.paid_date ?? m.due_date).slice(0, 10);
              const { dia, mes } = partes(data);
              return (
                <tr key={m.id} onClick={() => m.party_id && window.dispatchEvent(new CustomEvent("a4p:open-contato", { detail: { id: m.party_id } }))}
                  className="border-t border-border-soft cursor-pointer hover:bg-surface-2">
                  <td className="py-3">
                    <span className="flex items-center gap-3 min-w-0">
                      <span className="w-9 h-9 rounded-card bg-surface-2 inline-flex items-center justify-center shrink-0">
                        <Icon name={entrada ? "arrow-up" : "arrow-down-to-line"} size={15} color="var(--color-ink)" />
                      </span>
                      <span className="text-label text-ink truncate">{nome}</span>
                    </span>
                  </td>
                  <td className="py-3 text-label text-muted">{entrada ? "Entrada" : "Saída"}</td>
                  <td className="py-3 text-label text-muted truncate">{m.category ?? "—"}</td>
                  <td className="py-3 text-label text-muted tabular-nums">{dia} {MESES[mes - 1]}</td>
                  <td className="py-3 text-label text-ink tabular-nums text-right">
                    <BRL value={m.amount} showDecimals={false} />
                  </td>
                  <td className="py-3 text-right">
                    <span className="a4p-label text-muted inline-flex items-center gap-[6px] justify-end">
                      <span className="w-[7px] h-[7px] rounded-pill shrink-0"
                        style={{ background: m.status === "pago" ? "var(--color-positive)" : "var(--color-warning)" }} />
                      {m.status === "pago" ? "Liquidado" : "Previsto"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {linhas.length === 0 && (
          <p className="m-0 py-8 text-center text-caption text-muted">Nenhuma transação encontrada.</p>
        )}
      </div>
      <button onClick={() => router.push("/dashboard/financial/statement")}
        className="mt-3 self-start text-caption text-muted hover:text-ink underline">
        ver o extrato ↗
      </button>
    </Card>
  );
}

/* --------------------------------- a Home -------------------------------- */

export function HomeQuatro() {
  const { data: input, isLoading } = useRiscoInput();

  if (isLoading || !input) {
    return (
      <div className="grid gap-5 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-card bg-white h-[320px] animate-pulse" data-card="1" />
        ))}
      </div>
    );
  }

  // A grade da referência: em cima 3/5 + 2/5; embaixo o bloco da IA menor que
  // a tabela, que é quem precisa de largura.
  /*
   * ⚠️ DUAS GRADES, não uma. As linhas têm proporções DIFERENTES (em cima
   * 60/40, embaixo 30/70) e uma grade CSS só tem um template de colunas para
   * todas as linhas. Forçar tudo numa grade exigiria `grid-column` com spans
   * inventados, que quebra na primeira mudança de proporção.
   */
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr] items-start">
        <Resumo input={input} />
        <Calendario input={input} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[3fr_7fr] items-start">
        <Dicas />
        <Recentes input={input} />
      </div>
    </div>
  );
}
