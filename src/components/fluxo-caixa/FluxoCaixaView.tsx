"use client";

import * as React from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, Cell, ReferenceLine,
} from "recharts";
import { Card, Icon, BRL, Button, Skeleton, InfoHint, SemDados, ValorIndicador, type InfoConteudo } from "@/components/ui";
import { simularCenario } from "@/core/executive/scenario";
import type { ScenarioInput } from "@/core/executive/types";
import { FluxoFiltrosProvider, useFluxoFiltros, PERIODOS } from "./FiltrosContext";
import { useModo } from "@/components/app/useModo";
import { Header } from "./Header";
import { useFluxoCaixa, useContas, useComparativo } from "./hooks";
import { Comparativos } from "./Comparativos";
import type {
  FluxoModelo, FluxoInteligente, PrevRealLinha, DiaCalendario, CrossCheck,
  ProjecaoHorizonte, BandaProj, DiaHeat, WaterfallPasso, Copilot, EventoFin,
} from "@/core/cashflow";
import type { IndicadoresFinanceiros } from "@/core/quant/types";
import { BaseDoSaldo } from "@/components/movimentacoes/BaseDoSaldo";
import { janela as fazJanela } from "@/core/indicadores";
import { formatBRL as fmtBRL } from "@/lib/format";

const pct = (n: number) => `${Math.round(n * 100)}%`;
const sign = (n: number) => (n >= 0 ? "+" : "−");

export function FluxoCaixaView() {
  return (
    <FluxoFiltrosProvider>
      <Inner />
    </FluxoFiltrosProvider>
  );
}

function Inner() {
  const { filtros } = useFluxoFiltros();
  /**
   * A janela do filtro, no tipo canônico. ⚠️ O fluxo olha para FRENTE: a
   * janela termina daqui a N dias, e é por isso que o saldo desta tela é o
   * PROJETADO — declarar isso é o que impede a comparação com o extrato de
   * parecer divergência.
   */
  const dias = PERIODOS.find((p) => p.id === filtros.periodo)?.dias ?? filtros.diasCustom;
  const hojeISO = new Date().toISOString().slice(0, 10);
  const fim = new Date(Date.now() + Math.max(0, dias - 1) * 86400000).toISOString().slice(0, 10);
  const janelaDoFiltro = fazJanela(hojeISO, fim, `Próximos ${dias} dias`);
  const contas = useContas();
  const { data, isLoading } = useFluxoCaixa(filtros);
  const comp = useComparativo(filtros);
  const { pro } = useModo();

  return (
    <div className="flex flex-col gap-7 pb-6">
      <Card className="flex flex-col gap-4">
        <Header contas={contas.data ?? []} />
      </Card>

      {/* ⚠️ Esta tela projeta: o saldo que ela mostra é o de HOJE mais os
          títulos previstos até o fim da janela. Declarar isso é o item 4 do
          mapa de consolidação — três telas respondiam "quanto eu tenho" com
          números diferentes e nenhuma dizia qual recorte usava. */}
      <BaseDoSaldo base="projetado_fim" janela={janelaDoFiltro} />

      {/* Comparativos período × período anterior — a leitura de topo da página. */}
      <Comparativos c={comp.data} isLoading={comp.isLoading} />

      {isLoading || !data ? (
        <Skeleton className="h-[240px]" />
      ) : (
        <>
          {/* Modo Simples: 3 blocos essenciais. */}
          <ExecutiveSummary m={data} />
          <Bloco
            titulo="Venceu × Foi pago"
            icon="list-checks"
            info={{
              oQue: "Olha para trás: dos títulos que venceram no período, quanto já foi efetivamente pago — por contraparte, com um comentário da IA.",
              comoCalcula: "Toma os títulos com vencimento dentro da janela retroativa e compara o total que venceu com a parte dele que está paga. As duas colunas saem do mesmo conjunto de títulos, então o percentual é o quanto do compromisso do período foi cumprido; o que falta é atraso.",
            }}
          ><PrevRealView linhas={data.prevReal} /></Bloco>
          <Bloco
            titulo="Calendário Financeiro"
            icon="receipt"
            info={{
              oQue: "Mostra dia a dia o que entra, o que sai e o saldo resultante, para enxergar os dias apertados.",
              comoCalcula: "Soma recebimentos e pagamentos previstos de cada dia e acumula o saldo ao longo do período.",
            }}
          ><CalendarioView dias={data.calendario} /></Bloco>

          {/* Modo Pro: profundidade completa. */}
          {pro && <>
            <Bloco
              titulo="Fluxo de Caixa Inteligente"
              icon="trending-up"
              info={{
                oQue: "A árvore do caixa: do saldo inicial às entradas e saídas, até o fluxo operacional, livre e o saldo final.",
                comoCalcula: "Parte do saldo inicial e agrupa entradas e saídas por origem (PIX, boletos, fornecedores, folha, impostos), expansíveis por linha.",
              }}
            ><FluxoInteligenteView f={data.fluxo} /></Bloco>
            <Bloco
              titulo="Cross-check Inteligente"
              icon="sparkles"
              info={{
                oQue: "Confere se as cadeias de despesa e recebimento estão consistentes, sinalizando o que bate e o que não bate.",
                comoCalcula: "A IA verifica cada cadeia (fornecedor, recorrência, nota) contra os dados e marca cada passo como ok ou pendente.",
              }}
            ><CrossCheckView checks={data.crossChecks} /></Bloco>
            <Bloco
              titulo="Projeção com Machine Learning"
              icon="activity"
              info={{
                oQue: "Projeta o caixa futuro em vários horizontes, com bandas de cenário e a chance de ficar negativo.",
                comoCalcula: "Simulação Monte Carlo que aprende deriva e volatilidade do histórico e gera bandas p10/p50/p90 do saldo.",
              }}
            >
              <ProjecaoView bandas={data.bandas} projecoes={data.projecoes} />
            </Bloco>
            <Bloco
              titulo="Cenários"
              icon="cpu"
              info={{
                oQue: "Testa situações como atraso de cliente, queda de receita ou contratação e mostra o efeito em runway, score, burn e resultado.",
                comoCalcula: "Cada cenário aplica seus choques sobre os indicadores atuais e re-simula runway, score e burn comparados à base.",
              }}
            ><CenariosView indic={data.indicadores} saldo={data.saldoAtual} /></Bloco>
            <Bloco
              titulo="Heat Map Financeiro"
              icon="gauge"
              info={{
                oQue: "Pinta cada dia de verde, amarelo ou vermelho conforme o conforto do caixa, para achar os períodos de aperto.",
                comoCalcula: "Classifica o saldo projetado de cada dia em faixas: confortável, atenção ou risco.",
              }}
            ><HeatmapView dias={data.heatmap} /></Bloco>
            {/*
              * ⚠️ **O TÍTULO MUDA COM O REGIME, e essa é a regra — não um
              * detalhe de rótulo.** Esta cascata sai de `financialDRE`, que
              * recebe o regime do seletor acima. Em COMPETÊNCIA ela é um DRE.
              * Em CAIXA ela não é: um DRE é por definição competência, e chamar
              * de DRE uma apuração por data de pagamento entrega ao contador (e
              * ao investidor) um documento com o nome errado.
              *
              * A visão de caixa é legítima e por isso merece o nome dela.
              * Nenhum número muda de significado sem mudar de nome — a mesma
              * regra que vale para `quant`/burn.
              */}
            <Bloco
              titulo={filtros.regime === "caixa"
                ? "Resultado — regime de caixa (da receita ao fluxo livre)"
                : "DRE — da receita ao fluxo livre"}
              icon="building"
              info={{
                oQue: filtros.regime === "caixa"
                  ? "Mostra em cascata como o dinheiro que ENTROU vira fluxo livre, passando pelas saídas pelo caminho. É a leitura de caixa, pela data de pagamento — não é um DRE."
                  : "Mostra em cascata como a receita vira fluxo livre, passando pelas deduções pelo caminho.",
                comoCalcula: filtros.regime === "caixa"
                  ? "Mesma cascata do DRE, apurada pela data de PAGAMENTO (regime de caixa): só o que foi liquidado entra."
                  : "Mesma cascata do DRE (competência, pela data de vencimento): empilha as deduções uma a uma até o resultado.",
              }}
            ><WaterfallView passos={data.waterfall} /></Bloco>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
              <Bloco
                titulo="IA Copilot do Caixa"
                icon="sparkles"
                info={{
                  oQue: "Resume o que a IA encontrou no caixa e sugere ações práticas para o período.",
                  comoCalcula: "A IA lê os blocos do fluxo e destaca achados e sugestões priorizados por impacto.",
                }}
              ><CopilotView c={data.copilot} /></Bloco>
              <Bloco
                titulo="What-If Engine"
                icon="cpu"
                info={{
                  oQue: "Sliders para você simular ao vivo mudanças de receita, despesa, inadimplência e folha e ver o efeito no caixa.",
                  comoCalcula: "Cada movimento do slider re-simula o cenário e atualiza runway, score e resultado mensal na hora.",
                }}
              ><WhatIfView indic={data.indicadores} saldo={data.saldoAtual} /></Bloco>
            </div>
            <Bloco
              titulo="Eventos Financeiros"
              icon="network"
              info={{
                oQue: "Uma linha do tempo dos movimentos recentes do caixa (entradas, saídas e eventos neutros).",
                comoCalcula: "Lista os lançamentos do período em ordem, com tipo, valor e quando aconteceram.",
              }}
            ><EventosView eventos={data.eventos} /></Bloco>
            <Bloco
              titulo="Confidence Layer"
              icon="gauge"
              info={{
                oQue: "Mostra o quão confiável é cada projeção de caixa por horizonte.",
                comoCalcula: "A confiança cai conforme o horizonte aumenta e conforme o fluxo é mais volátil.",
              }}
            ><ConfidenceView projecoes={data.projecoes} /></Bloco>
            <DigitalTwinView twin={data.twin} />
          </>}

          {!pro && (
            <p className="text-caption text-faint text-center">Projeção ML, cenários, heat map, waterfall e digital twin no <b className="text-muted font-medium">Modo Pro</b> (alterna na barra lateral).</p>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- Shell de bloco ---------- */
function Bloco({ titulo, icon, info, children }: { titulo: string; icon: string; info?: InfoConteudo; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Icon name={icon} size={16} color="var(--color-text-secondary)" />
        <h2 className="m-0 text-label font-medium text-muted">{titulo}</h2>
        {info && <InfoHint align="left" {...info} />}
      </div>
      {children}
    </section>
  );
}

/* ---------- 1. Executive Summary ---------- */
function ExecutiveSummary({ m }: { m: FluxoModelo }) {
  const r = m.resumo;
  const cards = [
    // ⚠️ Os três primeiros passaram a ler o indicador INTEIRO e a abrir a
    // origem no clique (fórmula, período, regime e os lançamentos que compõem).
    // "R$ 0 de entradas previstas" e "nenhum título vence nesta janela" são
    // frases diferentes, e é a segunda que diz o que fazer.
    { label: "Caixa atual", node: <ValorIndicador indicador={r.caixaCanonico} titulo="Caixa atual" />, tone: "ink" },
    // ⚠️ "Projetadas", não "previstas": o número passou a incluir o VENCIDO em
    // aberto — dinheiro que ainda vai se mover, e que o `>= hoje` deixava de
    // fora. O rótulo de baixo DIZ a regra e quanto dela é atraso; sem isso o
    // cartão sobe de valor sem nada na tela explicando por quê.
    {
      label: "Entradas projetadas",
      janela: r.entradasVencidas > 0 ? `inclui ${fmtBRL(r.entradasVencidas)} vencido — ${r.regraDoVencido}` : undefined,
      node: <ValorIndicador indicador={r.entradasCanonicas} titulo="Entradas projetadas" />,
      tone: "positive",
    },
    {
      label: "Saídas projetadas",
      janela: r.saidasVencidas > 0 ? `inclui ${fmtBRL(r.saidasVencidas)} vencido — ${r.regraDoVencido}` : undefined,
      node: <ValorIndicador indicador={r.saidasCanonicas} titulo="Saídas projetadas" />,
      tone: "ink",
    },
    // ⚠️ A4P-005: estes dois olham para lados OPOSTOS do tempo e ficam lado a
    // lado. A janela de cada um vai NO CARTÃO — sem ela, a leitura natural é
    // subtrair um do outro, e a conta não significa nada.
    { label: "Geração de caixa", janela: r.janelaGeracao, node: <span>{sign(r.geracaoCaixa)}<BRL value={Math.abs(r.geracaoCaixa)} /></span>, tone: r.geracaoCaixa >= 0 ? "positive" : "negative" },
    { label: "Burn", janela: r.janelaBurn, node: <BRL value={r.burn} />, tone: "ink" },
    // ⚠️ O "∞" saía de `>= 99`, que é o TETO do cálculo lido como se fosse a
    // medida — foi essa a linha que exibiu "33 meses de fôlego" ao lado de um
    // burn zero. Agora o cartão pergunta ao indicador se existe número.
    {
      label: "Runway",
      node: r.runway.indisponivel
        ? <SemDados motivo={r.runway.indisponivel.motivo} codigo={r.runway.indisponivel.codigo}
                    className="text-caption" />
        : <span>{r.runway.valor.toFixed(0)} <span className="text-caption text-faint">meses</span></span>,
      tone: "ink",
    },
    { label: "Chance de ruptura", node: <span>{pct(r.chanceRuptura)}</span>, tone: r.chanceRuptura > 0.2 ? "negative" : r.chanceRuptura > 0.08 ? "warning" : "positive" },
    { label: "Financial Score", node: <span>{Math.round(r.score)}<span className="text-caption text-faint">/100</span></span>, tone: "ink" },
  ];
  const cor: Record<string, string> = {
    ink: "var(--color-ink)", positive: "var(--color-positive)", negative: "var(--color-negative)", warning: "var(--color-warning)",
  };
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((c) => (
        <Card key={c.label} className="flex flex-col gap-1">
          <span className="text-caption text-faint">{c.label}</span>
          <span className="text-h3 font-medium tabular-nums leading-none" style={{ color: cor[c.tone] }}>{c.node}</span>
          {/* A janela só aparece onde ela DISTINGUE: marcar todos os cartões
              seria não marcar nenhum, a mesma regra do selo de procedência. */}
          {"janela" in c && c.janela ? (
            <span className="text-[11px] leading-tight text-faint">{c.janela}</span>
          ) : null}
        </Card>
      ))}
    </div>
  );
}

/* ---------- 2. Fluxo de Caixa Inteligente (árvore) ---------- */
function FluxoInteligenteView({ f }: { f: FluxoInteligente }) {
  return (
    <Card className="flex flex-col gap-1">
      <LinhaFluxo label="Saldo inicial" valor={f.saldoInicial} forte />
      <GrupoFluxo titulo="Entradas" total={f.entradas.total} grupos={f.entradas.grupos} tom="positive" />
      <GrupoFluxo titulo="Saídas" total={-f.saidas.total} grupos={f.saidas.grupos} tom="negative" />
      <LinhaFluxo label="Fluxo operacional" valor={f.operacional} forte />
      <LinhaFluxo label="Investimentos" valor={f.investimentos} />
      <LinhaFluxo label="Financiamentos" valor={f.financiamentos} />
      <LinhaFluxo label="Fluxo livre" valor={f.livre} forte />
      <div className="h-px bg-border-soft my-1" />
      <LinhaFluxo label="Saldo final" valor={f.saldoFinal} forte destaque />
    </Card>
  );
}
function LinhaFluxo({ label, valor, forte, destaque }: { label: string; valor: number; forte?: boolean; destaque?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-[7px] ${destaque ? "bg-surface-2 rounded-md px-3" : ""}`}>
      <span className={`text-${forte ? "body" : "caption"} ${forte ? "text-ink font-medium" : "text-muted"}`}>{label}</span>
      <span className="tabular-nums" style={{ color: "var(--color-ink)" }}>
        {valor < 0 ? "−" : ""}<BRL value={Math.abs(valor)} />
      </span>
    </div>
  );
}
function GrupoFluxo({ titulo, total, grupos, tom }: { titulo: string; total: number; grupos: { label: string; valor: number; itens: { label: string; valor: number }[] }[]; tom: "positive" | "negative" }) {
  const [aberto, setAberto] = React.useState<string | null>(null);
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between py-[7px]">
        <span className="text-body text-ink font-medium">{titulo}</span>
        <span className="tabular-nums" style={{ color: tom === "positive" ? "var(--color-positive)" : "var(--color-negative)" }}>
          {tom === "negative" ? "−" : ""}<BRL value={Math.abs(total)} />
        </span>
      </div>
      {grupos.map((g) => {
        const on = aberto === g.label;
        return (
          <div key={g.label} className="flex flex-col">
            <button onClick={() => setAberto(on ? null : g.label)} className="flex items-center justify-between py-[5px] pl-4 hover:bg-surface-1 rounded-md">
              <span className="inline-flex items-center gap-1 text-caption text-muted">
                <Icon name={on ? "chevron-down" : "chevron-right"} size={13} color="var(--color-text-tertiary)" />
                {g.label}
              </span>
              <span className="text-caption text-muted tabular-nums"><BRL value={g.valor} /></span>
            </button>
            {on && g.itens.map((it, i) => (
              <div key={i} className="flex items-center justify-between py-[3px] pl-10 pr-1">
                <span className="text-caption text-faint truncate max-w-[60%]">{it.label}</span>
                <span className="text-caption text-faint tabular-nums"><BRL value={it.valor} /></span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- 3. Previsto x Realizado ---------- */
function PrevRealView({ linhas }: { linhas: PrevRealLinha[] }) {
  if (!linhas.length) return <Card><span className="text-caption text-faint">Nenhum título venceu neste período.</span></Card>;
  return (
    <Card padded={false}>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tabela rolável">
        <table className="w-full border-collapse text-caption">
          <thead>
            <tr className="text-faint">
              <th className="text-left font-medium py-3 px-4">Linha</th>
              <th className="text-right font-medium py-3 px-3">Venceu</th>
              <th className="text-right font-medium py-3 px-3">Foi pago</th>
              <th className="text-right font-medium py-3 px-3">Diferença</th>
              <th className="text-right font-medium py-3 px-3">%</th>
              <th className="text-left font-medium py-3 px-4 w-[34%]">IA</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.label} className="border-t border-border-soft align-top">
                <td className="py-3 px-4 text-ink">{l.label}</td>
                <td className="py-3 px-3 text-right tabular-nums text-muted"><BRL value={l.planejado} /></td>
                <td className="py-3 px-3 text-right tabular-nums text-ink"><BRL value={l.realizado} /></td>
                <td className="py-3 px-3 text-right tabular-nums" style={{ color: l.diff < 0 ? "var(--color-negative)" : "var(--color-positive)" }}>
                  {l.diff < 0 ? "−" : "+"}<BRL value={Math.abs(l.diff)} />
                </td>
                <td className="py-3 px-3 text-right tabular-nums" style={{ color: Math.abs(l.pct) < 0.03 ? "var(--color-muted)" : l.pct < 0 ? "var(--color-negative)" : "var(--color-warning)" }}>
                  {l.pct >= 0 ? "+" : ""}{Math.round(l.pct * 100)}%
                </td>
                <td className="py-3 px-4 text-muted leading-[1.45]">{l.ia}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ---------- 4. Calendário Financeiro ---------- */
function CalendarioView({ dias }: { dias: DiaCalendario[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
      {dias.map((d, i) => (
        <Card key={d.date} className="flex flex-col gap-1 !p-3">
          <span className="text-caption text-faint">{i === 0 ? "Hoje" : d.label}</span>
          <span className="text-caption text-positive tabular-nums">+<BRL value={d.recebe} /></span>
          <span className="text-caption text-muted tabular-nums">−<BRL value={d.paga} /></span>
          <span className="text-caption font-medium tabular-nums border-t border-border-soft pt-1" style={{ color: "var(--color-ink)" }}>
            {d.saldo < 0 ? "−" : ""}<BRL value={Math.abs(d.saldo)} />
          </span>
        </Card>
      ))}
    </div>
  );
}

/* ---------- 5. Cross-check ---------- */
function CrossCheckView({ checks }: { checks: CrossCheck[] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {checks.map((c) => (
        <Card key={c.titulo} className="flex flex-col gap-2">
          <span className="text-label font-medium text-muted">{c.titulo}</span>
          <div className="flex flex-col gap-[6px]">
            {c.passos.map((p, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="w-[18px] h-[18px] rounded-pill inline-flex items-center justify-center shrink-0 mt-[1px]" style={{ background: p.ok ? "var(--color-positive)" : "var(--color-surface-3)" }}>
                  <Icon name={p.ok ? "check" : "x"} size={11} color={p.ok ? "var(--color-on-lime)" : "var(--color-text-tertiary)"} />
                </span>
                <div className="flex flex-col">
                  <span className="text-caption text-ink">{p.label}</span>
                  <span className="text-caption text-faint leading-[1.4]">{p.detalhe}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ---------- 6. Projeção ML ---------- */
const fmtAxis = (n: number) => (Math.abs(n) >= 1000 ? `${Math.round(n / 1000)}k` : `${Math.round(n)}`);
function ProjecaoView({ bandas, projecoes }: { bandas: BandaProj[]; projecoes: ProjecaoHorizonte[] }) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="h-[260px]" role="img" aria-label="Projeção de caixa Monte Carlo com bandas p10/p50/p90">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={bandas} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="projGlow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-lime)" stopOpacity={0.20} />
                <stop offset="70%" stopColor="var(--color-lime)" stopOpacity={0.05} />
                <stop offset="100%" stopColor="var(--color-lime)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--color-border-soft)" vertical={false} />
            <XAxis dataKey="data" tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} tickFormatter={(d: string) => d.slice(5)} minTickGap={28} />
            <YAxis tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} tickFormatter={fmtAxis} width={40} />
            <ReferenceLine y={0} stroke="var(--color-negative)" strokeDasharray="3 3" />
            <Tooltip
              contentStyle={{ borderRadius: 10, border: "1px solid var(--color-border)", fontSize: 12 }}
              formatter={(v: number, n: string) => [fmtBRL(v), n.toUpperCase()]}
              labelFormatter={(d) => `Dia ${d}`}
            />
            <Area dataKey="p90" stroke="none" fill="url(#projGlow)" />
            <Area dataKey="p10" stroke="none" fill="var(--color-white)" fillOpacity={0} />
            <Line dataKey="p90" stroke="var(--color-border)" strokeWidth={1} dot={false} strokeDasharray="3 3" />
            <Line dataKey="p10" stroke="var(--color-border)" strokeWidth={1} dot={false} strokeDasharray="3 3" />
            <Line dataKey="p50" stroke="var(--color-chart-line)" strokeWidth={1.6} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {projecoes.map((p) => (
          <div key={p.dias} className="flex flex-col gap-[2px] border-l-2 pl-2" style={{ borderColor: p.probNegativo > 0.2 ? "var(--color-negative)" : "var(--color-border)" }}>
            <span className="text-caption text-faint">{p.horizonte}</span>
            <span className="text-body tabular-nums text-ink"><BRL value={p.p50} /></span>
            <span className="text-caption text-faint tabular-nums">p10 <BRL value={p.p10} /></span>
            <span className="text-caption" style={{ color: p.probNegativo > 0.2 ? "var(--color-negative)" : "var(--color-muted)" }}>ruptura {pct(p.probNegativo)}</span>
          </div>
        ))}
      </div>
      <span className="text-caption text-faint">A IA aprende o comportamento (sazonalidade, recorrência, inadimplência, atrasos) — não é linha reta: Monte Carlo com bandas p10/p50/p90.</span>
    </Card>
  );
}

/* ---------- Cenários ---------- */
const CENARIOS: { id: string; titulo: string; sc: ScenarioInput | ((i: IndicadoresFinanceiros) => ScenarioInput) }[] = [
  { id: "atraso", titulo: "Cliente atrasa 30 dias", sc: { inadimplenciaDelta: 0.08 } },
  { id: "queda", titulo: "Receita cai 20%", sc: { receitaDelta: -0.2 } },
  { id: "combustivel", titulo: "Combustível sobe 15%", sc: { despesaDelta: 0.05 } },
  { id: "financiamento", titulo: "Novo financiamento", sc: { despesaDelta: 0.04 } },
  { id: "equipe", titulo: "Contratação de equipe", sc: (i) => ({ folhaDelta: 0.15 * i.despesaMensal }) },
  { id: "aquisicao", titulo: "Aquisição de empresa", sc: { receitaDelta: 0.25, despesaDelta: 0.2 } },
];
function CenariosView({ indic, saldo }: { indic: IndicadoresFinanceiros; saldo: number }) {
  const [sel, setSel] = React.useState("queda");
  const base = simularCenario(indic, saldo, {});
  const ativo = CENARIOS.find((c) => c.id === sel)!;
  const sc = typeof ativo.sc === "function" ? ativo.sc(indic) : ativo.sc;
  const res = simularCenario(indic, saldo, sc);
  const deltas = [
    { label: "Runway", base: `${base.runwayMeses.toFixed(0)}m`, novo: `${res.runwayMeses.toFixed(0)}m`, pior: res.runwayMeses < base.runwayMeses },
    { label: "Score", base: `${Math.round(base.scoreProjetado)}`, novo: `${Math.round(res.scoreProjetado)}`, pior: res.scoreProjetado < base.scoreProjetado },
    { label: "Burn", base: <BRL value={base.burnRate} />, novo: <BRL value={res.burnRate} />, pior: res.burnRate > base.burnRate },
    { label: "Resultado/mês", base: <BRL value={base.liquidoMensal} />, novo: <BRL value={res.liquidoMensal} />, pior: res.liquidoMensal < base.liquidoMensal },
  ];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
      <Card className="lg:col-span-1 flex flex-col gap-2">
        <div className="flex items-center gap-2"><Icon name="cpu" size={15} color="var(--color-text-secondary)" /><span className="text-label font-medium text-muted">Simular cenário</span></div>
        {CENARIOS.map((c) => (
          <button key={c.id} onClick={() => setSel(c.id)} className={`text-left rounded-md px-3 py-2 text-caption transition-colors ${sel === c.id ? "bg-surface-2 text-ink font-medium" : "text-muted hover:bg-surface-1"}`}>
            {c.titulo}
          </button>
        ))}
      </Card>
      <Card className="lg:col-span-2 flex flex-col gap-3">
        <span className="text-body text-ink font-medium">{ativo.titulo}</span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {deltas.map((d) => (
            <div key={d.label} className="flex flex-col gap-[2px]">
              <span className="text-caption text-faint">{d.label}</span>
              <span className="text-body tabular-nums" style={{ color: d.pior ? "var(--color-negative)" : "var(--color-positive)" }}>{d.novo}</span>
              <span className="text-caption text-faint tabular-nums">base {d.base}</span>
            </div>
          ))}
        </div>
        <span className="text-caption text-muted leading-[1.5] border-t border-border-soft pt-2">{res.texto}</span>
      </Card>
    </div>
  );
}

/* ---------- 7. Heat Map ---------- */
const HEAT: Record<DiaHeat["nivel"], string> = { verde: "var(--color-positive)", amarelo: "var(--color-warning)", vermelho: "var(--color-negative)" };
function HeatmapView({ dias }: { dias: DiaHeat[] }) {
  if (!dias.length) return <Card><span className="text-caption text-faint">Sem projeção diária no período.</span></Card>;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-[5px]">
        {dias.map((d) => (
          <div key={d.date} title={`${d.label}: ${fmtBRL(d.saldo)}`}
            className="w-[22px] h-[22px] rounded-sm" style={{ background: HEAT[d.nivel] }} />
        ))}
      </div>
      <div className="flex items-center gap-4 text-caption text-faint">
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: HEAT.verde }} /> confortável</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: HEAT.amarelo }} /> atenção</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: HEAT.vermelho }} /> risco</span>
      </div>
    </Card>
  );
}

/* ---------- 8. Waterfall ---------- */
function WaterfallView({ passos }: { passos: WaterfallPasso[] }) {
  if (!passos.length) return <Card><span className="text-caption text-faint">Sem dados para o waterfall.</span></Card>;
  // Monta barras flutuantes: base invisível + delta visível.
  const data = passos.map((p) => {
    const ini = p.tipo === "deducao" ? p.acumulado - p.valor : 0; // valor é negativo na dedução
    const lo = Math.min(p.tipo === "deducao" ? p.acumulado : 0, ini);
    const hi = Math.max(p.tipo === "deducao" ? p.acumulado : p.acumulado, ini);
    return { label: p.label, base: p.tipo === "deducao" ? lo : 0, valor: p.tipo === "deducao" ? hi - lo : p.acumulado, tipo: p.tipo };
  });
  return (
    <Card>
      <div className="h-[280px]" role="img" aria-label="Waterfall da receita ao fluxo livre">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--color-border-soft)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }} interval={0} angle={-18} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} tickFormatter={fmtAxis} width={42} />
            <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid var(--color-border)", fontSize: 12 }} formatter={(v: number) => fmtBRL(v)} />
            <Bar dataKey="base" stackId="w" fill="transparent" />
            <Bar dataKey="valor" stackId="w" radius={[3, 3, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.tipo === "deducao" ? "var(--color-negative)" : d.tipo === "total" ? "var(--color-chart-line)" : "var(--color-ink)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

/* ---------- 9. IA Copilot ---------- */
const TOM: Record<string, { icon: string; cor: string }> = {
  ok: { icon: "check", cor: "var(--color-positive)" },
  atencao: { icon: "gauge", cor: "var(--color-warning)" },
  risco: { icon: "trending-up", cor: "var(--color-negative)" },
};
function CopilotView({ c }: { c: Copilot }) {
  return (
    <Card className="flex flex-col gap-3 h-full">
      <span className="text-caption font-medium text-faint tracking-wide">Encontramos</span>
      <div className="flex flex-col gap-2">
        {c.achados.map((a, i) => (
          <div key={i} className="flex items-start gap-2">
            <Icon name={TOM[a.tom].icon} size={14} color={TOM[a.tom].cor} className="mt-[2px]" />
            <span className="text-caption text-muted leading-[1.5]">{a.texto}</span>
          </div>
        ))}
      </div>
      {c.sugestoes.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-border-soft pt-2">
          <span className="text-caption font-medium text-faint tracking-wide">Sugestões</span>
          {c.sugestoes.map((s, i) => (
            <span key={i} className="flex items-start gap-[6px] text-caption text-ink leading-[1.5]">
              <span className="w-[6px] h-[6px] rounded-pill bg-lime mt-[6px] shrink-0" />{s}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ---------- 10. What-If Engine ---------- */
function WhatIfView({ indic, saldo }: { indic: IndicadoresFinanceiros; saldo: number }) {
  const [receita, setReceita] = React.useState(0); // -0.2..0.2
  const [despesa, setDespesa] = React.useState(0);
  const [inad, setInad] = React.useState(0); // 0..0.2
  const [folha, setFolha] = React.useState(0); // 0..0.3 (fração da despesa)
  const res = simularCenario(indic, saldo, {
    receitaDelta: receita, despesaDelta: despesa, inadimplenciaDelta: inad, folhaDelta: folha * indic.despesaMensal,
  });
  return (
    <Card className="flex flex-col gap-3 h-full">
      <Slider label="Receita" value={receita} set={setReceita} min={-0.2} max={0.2} fmt={(v) => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`} />
      <Slider label="Despesas" value={despesa} set={setDespesa} min={-0.2} max={0.2} fmt={(v) => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`} />
      <Slider label="Inadimplência" value={inad} set={setInad} min={0} max={0.2} step={0.05} fmt={(v) => `+${Math.round(v * 100)}pp`} />
      <Slider label="Folha" value={folha} set={setFolha} min={0} max={0.3} step={0.05} fmt={(v) => `+${Math.round(v * 100)}%`} />
      <div className="grid grid-cols-3 gap-3 border-t border-border-soft pt-3">
        <Mini label="Runway" v={`${res.runwayMeses.toFixed(0)}m`} />
        <Mini label="Score" v={`${Math.round(res.scoreProjetado)}`} />
        <Mini label="Resultado/mês" v={<BRL value={res.liquidoMensal} />} tone={"var(--color-ink)"} />
      </div>
    </Card>
  );
}
function Slider({ label, value, set, min, max, step = 0.05, fmt }: { label: string; value: number; set: (v: number) => void; min: number; max: number; step?: number; fmt: (v: number) => string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between"><span className="text-caption text-muted">{label}</span><span className="text-caption text-ink tabular-nums">{fmt(value)}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} className="w-full accent-lime" />
    </div>
  );
}
function Mini({ label, v, tone = "var(--color-ink)" }: { label: string; v: React.ReactNode; tone?: string }) {
  return (
    <div className="flex flex-col gap-[2px]">
      <span className="text-caption text-faint">{label}</span>
      <span className="text-body tabular-nums" style={{ color: tone }}>{v}</span>
    </div>
  );
}

/* ---------- 11. Eventos ---------- */
function EventosView({ eventos }: { eventos: EventoFin[] }) {
  if (!eventos.length) return <Card><span className="text-caption text-faint">Sem eventos recentes.</span></Card>;
  const cor: Record<string, string> = { entrada: "var(--color-positive)", saida: "var(--color-negative)", neutro: "var(--color-faint)" };
  return (
    <Card className="flex flex-col">
      {eventos.map((e, i) => (
        <div key={i} className="flex items-center gap-3 py-[10px] border-t border-border-soft first:border-t-0">
          <span className="w-2 h-2 rounded-pill shrink-0" style={{ background: cor[e.tom] }} />
          <span className="text-caption text-faint w-[52px] shrink-0">{e.quando}</span>
          <span className="text-caption text-ink flex-1 truncate">{e.texto}</span>
          <span className="text-caption text-muted bg-surface-2 rounded-pill px-2 py-[1px] shrink-0">{e.tipo}</span>
          {e.valor != null && <span className="text-caption tabular-nums text-muted shrink-0"><BRL value={e.valor} /></span>}
        </div>
      ))}
    </Card>
  );
}

/* ---------- 12. Confidence Layer ---------- */
function ConfidenceView({ projecoes }: { projecoes: ProjecaoHorizonte[] }) {
  return (
    <Card className="flex flex-col gap-3">
      {projecoes.map((p) => (
        <div key={p.dias} className="flex items-center gap-3">
          <span className="text-caption text-muted w-[70px]">{p.horizonte}</span>
          <div className="flex-1 h-[8px] rounded-pill bg-surface-2 overflow-hidden">
            <div className="h-full rounded-pill" style={{ width: `${p.confianca * 100}%`, background: p.confianca >= 0.85 ? "var(--color-positive)" : p.confianca >= 0.7 ? "var(--color-warning)" : "var(--color-negative)" }} />
          </div>
          <span className="text-caption tabular-nums text-ink w-[42px] text-right">{pct(p.confianca)}</span>
        </div>
      ))}
      <span className="text-caption text-faint">Cada projeção carrega sua confiança — cai com o horizonte e com a volatilidade do fluxo.</span>
    </Card>
  );
}

/* ---------- 13. Digital Twin ---------- */
function DigitalTwinView({ twin }: { twin: { feeds: { entradas: string[]; saidas: string[]; inteligencia: string[] }; explicacao: string } }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="w-[26px] h-[26px] rounded-sm bg-lime inline-flex items-center justify-center"><Icon name="cpu" size={14} color="var(--color-on-lime)" /></span>
        <h2 className="m-0 text-label font-medium text-muted">Gêmeo digital do caixa do caixa</h2>
        <InfoHint
          align="left"
          titulo="Cash Flow Digital Twin"
          oQue="O gêmeo digital do caixa: reúne as fontes de entradas, saídas e inteligência e explica por que o caixa muda."
          comoCalcula="Quando um documento chega na Caixa de Entrada, ele atualiza automaticamente fluxo previsto/realizado, saldo, DRE, burn, runway e projeções."
        />
      </div>
      <Card className="flex flex-col gap-4" elevated={false} style={{ background: "var(--color-surface-2)" }}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FeedCol titulo="Entradas" itens={twin.feeds.entradas} />
          <FeedCol titulo="Saídas" itens={twin.feeds.saidas} />
          <FeedCol titulo="Inteligência" itens={twin.feeds.inteligencia} />
        </div>
        <div className="rounded-md p-3 border-l-2 border-lime" style={{ background: "var(--color-surface-1)" }}>
          <span className="text-caption font-medium text-faint tracking-wide">A IA explica o porquê</span>
          <p className="m-0 mt-1 text-caption text-muted leading-[1.6]">{twin.explicacao}</p>
        </div>
        <span className="text-caption text-faint leading-[1.5]">
          Quando um documento chega na Caixa de Entrada (boleto, nota, comprovante, contrato, PIX), o gêmeo atualiza
          automaticamente fluxo previsto/realizado, saldo projetado, DRE, burn, runway, tesouraria, Monte Carlo, cenários e dashboard.
        </span>
      </Card>
    </section>
  );
}
function FeedCol({ titulo, itens }: { titulo: string; itens: string[] }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-caption font-medium text-muted">{titulo}</span>
      <div className="flex flex-wrap gap-[6px]">
        {itens.map((i) => <span key={i} className="text-caption text-muted bg-surface-1 rounded-pill px-2 py-[2px]">{i}</span>)}
      </div>
    </div>
  );
}
