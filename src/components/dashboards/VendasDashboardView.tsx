"use client";

/**
 * Dashboards › Vendas (modelo IULI, Fig.2 — reconstrução fiel) — KPIs de
 * negócios digitais escopados por Mês/Trimestre/Ano a partir de um seletor
 * Mês/Ano no topo:
 *  • CAC · LTV · LTV/CAC · EBITDA (Mês/Trimestre/Ano · Acumulado · % Receita)
 *  • Faturamento bruto · Reembolsos · Chargebacks (cards destacados)
 *  • Gráficos: Vendas da semana · Vendas do ano · Receita Bruta, Margem de
 *    Contribuição e EBITDA.
 * Derivado dos lançamentos (getRiscoInput) — demo/live idêntico. Os cálculos:
 *  - Faturamento bruto = linha Receita Bruta da cascata do DRE (competência).
 *  - LTV = receita bruta da janela / clientes distintos com receita bruta na janela.
 *  - CAC = gasto de marketing da janela / clientes distintos com receita bruta na janela.
 *  - LTV/CAC = LTV÷CAC ("—" quando CAC=0: indefinido não é péssimo).
 *  - Margem de contribuição = receita − custos variáveis (CMV/comissão/taxa…).
 *  - EBITDA = receita − despesas operacionais (exclui financeiro, D&A e IRPJ/CSLL).
 *  - % Receita = EBITDA acumulado (YTD) ÷ receita acumulada (YTD).
 * CAC/LTV e o split de custo variável são aproximações por palavra-chave
 * (explicável; refina com base de clientes e custos categorizados).
 */
import * as React from "react";
import { ResponsiveContainer, ComposedChart, LineChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { AppShell } from "@/components/app/AppShell";
import { Card, Skeleton, Icon, InfoHint, BRL, type InfoConteudo } from "@/components/ui";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { formatBRL, formatBRLCompact, pct } from "@/lib/format";
import { dataDe } from "@/core/indicadores";
import { isoDay } from "@/lib/aggregations";
import { usePeriod, MES_ABBR } from "@/components/visao-geral/PeriodContext";
import { PeriodFilter } from "@/components/visao-geral/PeriodFilter";
import { NovoDeposito } from "@/components/visao-geral/NovoDeposito";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { isDemo } from "@/lib/demo";

const POSITIVE = "var(--color-positive)";
const ORANGE = "var(--color-warning)";
const INK = "var(--color-ink)";
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const RE = {
  reembolso: /reembol/i,
  chargeback: /chargeback|estorno/i,
  /*
   * ⚠️ `marketing` sobreviveu porque CAC não é linha do DRE: "quanto gastei
   * para adquirir cliente" é recorte de VENDA, e a `ESTRUTURA_DRE` não tem
   * essa linha. Mantê-lo aqui é honesto; movê-lo para a cascata seria inventar
   * estrutura contábil para caber uma métrica de marketing.
   *
   * ⚠️ **`variavel` e `foraEbitda` FORAM REMOVIDOS.** Eles eram a
   * classificação PRÓPRIA desta tela — a sexta do sistema — e produziam margem
   * de contribuição e EBITDA que ninguém obrigava a concordar com o relatório.
   * Quem responde por essas três linhas agora é `cascataDRE`.
   */
  marketing: /marketing|ads|an[úu]ncio|facebook|google|tr[áa]fego|publicidade|m[íi]dia/i,
};

import { chartAnim } from "@/lib/chart-anim";
/*
 * ⚠️ **A cascata é a fonte de RECEITA, MC e EBITDA desta tela.** Antes elas
 * saíam de uma soma inline com regex próprio (`RE.variavel`, `RE.foraEbitda`) e
 * `receita` era TODA entrada — empréstimo, aporte e rendimento inclusive. Era a
 * sexta contagem de resultado do sistema (`docs/auditoria.md`, #10).
 *
 * O que continua saindo do laço: CAC, LTV, clientes distintos, marketing,
 * reembolso e chargeback. Eles não são linhas do DRE — são leituras de VENDA, e
 * migrá-las para a cascata seria inventar linha que a estrutura não tem.
 */
import { cascataDRE } from "@/core/relatorios/cascata";

export function VendasDashboardView() {
  const { data, isLoading } = useRiscoInput();

  // mês de referência vem do FILTRO de período da Home (usePeriod) — os KPIs
  // (Mês/Trimestre/Ano) e os gráficos se adaptam à seleção.
  const period = usePeriod();
  const Y = period.ano, M = period.mes;

  // [oculto] widgets removíveis (× no card), como no IULI
  const [hidSemana, setHidSemana] = React.useState(false);
  const [hidAno, setHidAno] = React.useState(false);

  const calc = React.useMemo(() => {
    if (!data) return null;
    const pad = (n: number) => String(n).padStart(2, "0");
    const monthSel = `${Y}-${pad(M + 1)}`;
    const qStart = Math.floor(M / 3) * 3; // 1º mês do trimestre (0-based)

    // janelas (mês / trimestre / ano) — escalares para os KPIs
    const W = {
      mes: { receita: 0, marketing: 0, cli: new Set<string>() },
      tri: { receita: 0, marketing: 0, cli: new Set<string>() },
      ano: { receita: 0, marketing: 0, cli: new Set<string>() },
    };
    let reembMes = 0, reembAno = 0, chargeMes = 0, chargeAno = 0;
    // séries mensais do ANO selecionado (12 meses) p/ os gráficos
    const monthly = Array.from({ length: 12 }, () => ({ receita: 0, mc: 0, ebitda: 0 }));
    // série da SEMANA-âncora (domingo→sábado)
    const semana = WEEKDAYS.map((d) => ({ dia: d, receita: 0 }));
    // âncora da semana: hoje se o mês selecionado é o atual; senão o último dia do mês
    const hojeD = new Date(data.hoje + "T00:00:00");
    const ehMesAtual = hojeD.getFullYear() === Y && hojeD.getMonth() === M;
    const anchor = ehMesAtual ? hojeD : new Date(Y, M + 1, 0);
    const domingo = new Date(anchor); domingo.setDate(anchor.getDate() - anchor.getDay());
    const sabado = new Date(domingo); sabado.setDate(domingo.getDate() + 6);

    for (const mv of data.movements) {
      if (mv.status === "cancelado") continue;
      const ds = dataDe(mv, "competencia"); if (!ds) continue;
      const ym = ds.slice(0, 7);
      const y = Number(ds.slice(0, 4));
      const mi = Number(ds.slice(5, 7)) - 1;
      const cat = (mv.category || "").toLowerCase();
      const v = Math.abs(mv.amount);
      const inAno = y === Y;
      const inMes = ym === monthSel;
      const inTri = inAno && mi >= qStart && mi < qStart + 3;

      // ⚠️ Entradas NÃO saem daqui: clientes e a série da semana vêm da
      // classificação da cascata, abaixo. Contar "toda entrada" punha
      // empréstimo, aporte e transferência como venda.
      if (mv.type !== "entrada") {
        const ehMkt = RE.marketing.test(cat);
        const ehReemb = RE.reembolso.test(cat);
        const ehCharge = RE.chargeback.test(cat);
        if (ehMkt) { if (inMes) W.mes.marketing += v; if (inTri) W.tri.marketing += v; if (inAno) W.ano.marketing += v; }
        if (ehReemb) { if (inMes) reembMes += v; if (inAno) reembAno += v; }
        if (ehCharge) { if (inMes) chargeMes += v; if (inAno) chargeAno += v; }
      }
    }

    /* ── RECEITA, MARGEM DE CONTRIBUIÇÃO E EBITDA: da cascata ─────────────── */
    /*
     * ⚠️ Uma chamada por mês do ano e uma por janela. A cascata classifica pela
     * `ESTRUTURA_DRE` — a mesma que desenha o relatório — então "receita" aqui
     * passa a ser FATURAMENTO, e não "tudo que entrou". Na base auditada a
     * diferença é de R$ 15.000 de empréstimo bancário e R$ 20.000 de
     * transferência entre contas próprias.
     */
    const janelaCascata = (de: string, ate: string) =>
      cascataDRE(data, { intervalo: { de, ate }, regime: "competencia" });
    const ultimoDia = (ano: number, mesIdx: number) => `${ano}-${pad(mesIdx + 1)}-${pad(new Date(ano, mesIdx + 1, 0).getDate())}`;

    for (let i = 0; i < 12; i++) {
      const c = janelaCascata(`${Y}-${pad(i + 1)}-01`, ultimoDia(Y, i));
      monthly[i].receita = c.linhas.receita_bruta.valor;
      monthly[i].mc = c.linhas.margem_contribuicao.valor;
      monthly[i].ebitda = c.linhas.ebitda.valor;
    }
    const cMes = janelaCascata(`${monthSel}-01`, ultimoDia(Y, M));
    const cTri = janelaCascata(`${Y}-${pad(qStart + 1)}-01`, ultimoDia(Y, qStart + 2));
    const cAno = janelaCascata(`${Y}-01-01`, `${Y}-12-31`);
    W.mes.receita = cMes.linhas.receita_bruta.valor;
    W.tri.receita = cTri.linhas.receita_bruta.valor;
    W.ano.receita = cAno.linhas.receita_bruta.valor;

    /*
     * ⚠️ **Clientes e "Vendas da semana" saem da MESMA classificação da
     * receita bruta.** `relatorio.classificacao` diz em que linha cada
     * movimento caiu e com que valor (estorno já negativo). Antes a semana
     * somava toda entrada não cancelada — empréstimo, aporte, transferência —
     * por vencimento, e o LTV dividia a receita bruta por um número de
     * "clientes" que incluía o banco que emprestou. O numerador e o
     * denominador passam a falar do mesmo conjunto de lançamentos.
     */
    const ehReceita = (c: ReturnType<typeof janelaCascata>, id: string) =>
      c.relatorio.classificacao[id]?.linha === "receita_bruta";
    for (const mv of data.movements) {
      if (!mv.party_id) continue;
      if (ehReceita(cMes, mv.id)) W.mes.cli.add(mv.party_id);
      if (ehReceita(cTri, mv.id)) W.tri.cli.add(mv.party_id);
      if (ehReceita(cAno, mv.id)) W.ano.cli.add(mv.party_id);
    }
    // A semana pode atravessar a virada do ano — tem cascata própria.
    const domISO = isoDay(domingo), sabISO = isoDay(sabado);
    const cSem = janelaCascata(domISO, sabISO);
    for (const mv of data.movements) {
      const cl = cSem.relatorio.classificacao[mv.id];
      if (!cl || cl.linha !== "receita_bruta") continue;
      const ds = dataDe(mv, "competencia");
      if (!ds || ds < domISO || ds > sabISO) continue;
      semana[new Date(ds + "T00:00:00").getDay()].receita += cl.valor;
    }

    const ltv = (w: { receita: number; cli: Set<string> }) => w.receita / Math.max(1, w.cli.size);
    const cac = (w: { marketing: number; cli: Set<string> }) => w.marketing / Math.max(1, w.cli.size);
    // ⚠️ Sem gasto de aquisição a razão NÃO EXISTE — é "—", não 0,00. Zero diria
// que cada real investido não voltou, quando nenhum real foi investido.
    const ratio = (l: number, c: number): number | null => (c > 0 ? l / c : null);

    const cacMes = cac(W.mes), cacTri = cac(W.tri), cacAno = cac(W.ano);
    const ltvMes = ltv(W.mes), ltvTri = ltv(W.tri), ltvAno = ltv(W.ano);

    // EBITDA: mês, acumulado (YTD = jan..mês selecionado) e % receita
    const ebitdaMes = monthly[M].ebitda;
    let ebitdaAcum = 0, receitaAcum = 0;
    for (let i = 0; i <= M; i++) { ebitdaAcum += monthly[i].ebitda; receitaAcum += monthly[i].receita; }
    const pctReceita = receitaAcum > 0 ? ebitdaAcum / receitaAcum : 0;

    // séries dos gráficos
    const serieAno = monthly.map((m, i) => ({ mes: MES_ABBR[i], receita: m.receita }));
    const serieRME = monthly.map((m, i) => ({ mes: MES_ABBR[i], receita: m.receita, mc: m.mc, ebitda: m.ebitda }));

    return {
      faturamentoMes: W.mes.receita, reembMes, reembAno, chargeMes, chargeAno,
      cacMes, cacTri, cacAno, ltvMes, ltvTri, ltvAno,
      lcMes: ratio(ltvMes, cacMes), lcTri: ratio(ltvTri, cacTri), lcAno: ratio(ltvAno, cacAno),
      ebitdaMes, ebitdaAcum, pctReceita,
      serieAno, serieRME, semana,
    };
  }, [data, Y, M]);

  const acoes = (
    <>
      {isDemo && <DemoBadge />}
      <PeriodFilter />
      <NovoDeposito />
    </>
  );

  return (
    <AppShell title="Painel de vendas" actions={acoes}>
      <div className="flex flex-col gap-5 pb-6">
        <p className="m-0 -mt-1 text-caption text-muted">CAC · LTV · LTV/CAC · EBITDA · Receita · Reembolsos · Chargebacks · período: <span className="text-ink font-medium">{period.label}</span>.</p>

        {isLoading || !calc ? (
          <Card><Skeleton className="h-64 w-full" /></Card>
        ) : (
          <>
            {/* Linha 1 — KPIs CAC · LTV · LTV/CAC · EBITDA */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <KpiCard titulo="CAC" rows={[["Mês", <BRL key="mes" value={calc.cacMes} />], ["Trimestre", <BRL key="tri" value={calc.cacTri} />], ["Ano", <BRL key="ano" value={calc.cacAno} />]]} info={{ titulo: "CAC", oQue: "Quanto custa, em média, conquistar cada cliente.", comoCalcula: "Gasto de marketing da janela (categorias de marketing, anúncios, tráfego) dividido pelo nº de clientes distintos com lançamento na Receita Bruta do DRE na janela, por competência." }} />
              <KpiCard titulo="LTV" rows={[["Mês", <BRL key="mes" value={calc.ltvMes} />], ["Trimestre", <BRL key="tri" value={calc.ltvTri} />], ["Ano", <BRL key="ano" value={calc.ltvAno} />]]} info={{ titulo: "LTV", oQue: "Quanto cada cliente gera de receita, em média.", comoCalcula: "Receita Bruta do DRE na janela (competência) dividida pelo nº de clientes distintos com lançamento nessa linha. Empréstimo, aporte e transferência não contam como venda nem como cliente." }} />
              <KpiCard titulo="LTV / CAC" rows={[["Mês", fmtRatio(calc.lcMes)], ["Trimestre", fmtRatio(calc.lcTri)], ["Ano", fmtRatio(calc.lcAno)]]} info={{ titulo: "LTV / CAC", oQue: "Mostra se cada real gasto para conquistar clientes volta em receita.", comoCalcula: "LTV dividido pelo CAC. Sem gasto de marketing no período a razão não existe e aparece como —. Acima de 3 é saudável." }} />
              <KpiCard titulo="EBITDA" rows={[["Mês", <BRL key="mes" value={calc.ebitdaMes} />], ["Acumulado", <BRL key="acum" value={calc.ebitdaAcum} />], ["% Receita", pct(calc.pctReceita)]]} info={{ titulo: "EBITDA", oQue: "Resultado operacional antes de juros, impostos e depreciação.", comoCalcula: "Linha EBITDA da cascata do DRE, por competência (receita bruta menos deduções, custos e despesas variáveis e operacionais; exclui financeiro, D&A e IRPJ/CSLL). % Receita é o EBITDA acumulado de janeiro ao mês selecionado sobre a receita bruta do mesmo intervalo." }} />
            </div>

            {/* Linha 2 — Faturamento · Reembolsos · Chargebacks */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <DestaqueCard titulo="Faturamento bruto" tint="lime" rows={[["Mês", <BRL key="mes" value={calc.faturamentoMes} />]]} info={{ titulo: "Faturamento bruto", oQue: "Tudo o que a empresa vendeu no período, antes de deduções.", comoCalcula: "Linha Receita Bruta da cascata do DRE, por competência, no mês selecionado. Fica de fora o que não é venda: receita financeira, empréstimo, aporte e transferência entre contas próprias." }} />
              <DestaqueCard titulo="Reembolsos" tint="lime" rows={[["Mês", <BRL key="mes" value={calc.reembMes} />], ["Ano", <BRL key="ano" value={calc.reembAno} />]]} info={{ titulo: "Reembolsos", oQue: "Valores devolvidos a clientes no período.", comoCalcula: "Soma das saídas cuja categoria indica reembolso, no mês e no ano." }} />
              <DestaqueCard titulo="Chargebacks" tint="negativo" rows={[["Mês", <BRL key="mes" value={calc.chargeMes} />], ["Ano", <BRL key="ano" value={calc.chargeAno} />]]} info={{ titulo: "Chargebacks", oQue: "Estornos contestados na operadora de cartão.", comoCalcula: "Soma das saídas cuja categoria indica chargeback ou estorno, no mês e no ano." }} />
            </div>

            {/* Gráficos de linha — Vendas da semana · Vendas do ano */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {!hidSemana && (
                <ChartCard titulo="Vendas da semana" onClose={() => setHidSemana(true)} info={{ titulo: "Vendas da semana", oQue: "Distribui a receita pelos dias da semana-âncora.", comoCalcula: "Receita Bruta do DRE por dia de competência, na semana (domingo a sábado) do dia atual — ou do último dia do mês selecionado. A mesma classificação do Faturamento bruto." }}>
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={calc.semana} margin={{ top: 16, right: 12, bottom: 0, left: -6 }}>
                      <CartesianGrid stroke="var(--color-border-soft)" strokeDasharray="3 3" />
                      <XAxis dataKey="dia" tick={{ fontSize: 12, fill: "var(--color-faint)" }} tickLine={false} axisLine={{ stroke: "var(--color-border-soft)" }} />
                      <YAxis tick={{ fontSize: 12, fill: "var(--color-faint)" }} tickLine={false} axisLine={false} width={64} tickFormatter={(v) => formatBRLCompact(v)} />
                      <Tooltip content={<DiaTip />} cursor={{ stroke: "var(--color-text-quaternary)", strokeDasharray: "3 3" }} />
                      <Line type="monotone" dataKey="receita" stroke={POSITIVE} strokeWidth={2.2} dot={{ r: 4, fill: "var(--color-white)", stroke: POSITIVE, strokeWidth: 2 }} activeDot={{ r: 6 }} {...chartAnim()} />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
              {!hidAno && (
                <ChartCard titulo="Vendas do ano" onClose={() => setHidAno(true)} info={{ titulo: "Vendas do ano", oQue: "Evolução mês a mês da receita no ano selecionado.", comoCalcula: "Linha Receita Bruta da cascata do DRE, mês a mês (competência), ao longo dos 12 meses do ano." }}>
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={calc.serieAno} margin={{ top: 16, right: 12, bottom: 0, left: -6 }}>
                      <CartesianGrid stroke="var(--color-border-soft)" strokeDasharray="3 3" />
                      <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "var(--color-faint)" }} tickLine={false} axisLine={{ stroke: "var(--color-border-soft)" }} interval={0} />
                      <YAxis tick={{ fontSize: 12, fill: "var(--color-faint)" }} tickLine={false} axisLine={false} width={64} tickFormatter={(v) => formatBRLCompact(v)} />
                      <Tooltip content={<DiaTip />} cursor={{ stroke: "var(--color-text-quaternary)", strokeDasharray: "3 3" }} />
                      <Line type="monotone" dataKey="receita" stroke={POSITIVE} strokeWidth={2.2} dot={{ r: 4, fill: "var(--color-white)", stroke: POSITIVE, strokeWidth: 2 }} activeDot={{ r: 6 }} {...chartAnim()} />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
              {hidSemana && hidAno && (
                <button onClick={() => { setHidSemana(false); setHidAno(false); }} className="text-caption font-medium text-muted hover:text-ink inline-flex items-center gap-1 self-start"><Icon name="plus" size={14} /> Restaurar gráficos</button>
              )}
            </div>

            {/* Área — Receita Bruta, Margem de Contribuição e EBITDA */}
            <Card className="flex flex-col gap-3">
              <span className="inline-flex items-center gap-1 text-[16px] font-semibold text-ink">Receita Bruta, Margem de Contribuição e EBITDA<InfoHint align="left" titulo="Receita, MC e EBITDA" oQue="Compara, mês a mês, a receita bruta, a margem de contribuição e o EBITDA." comoCalcula="As três linhas saem da cascata do DRE por competência, mês a mês: Receita Bruta; Margem de Contribuição = receita líquida menos custos e despesas variáveis; EBITDA = margem de contribuição menos despesas operacionais." /></span>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={calc.serieRME} margin={{ top: 16, right: 12, bottom: 0, left: -6 }}>
                  <defs>
                    <linearGradient id="recGlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-positive)" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="var(--color-positive)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--color-border-soft)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "var(--color-faint)" }} tickLine={false} axisLine={{ stroke: "var(--color-border-soft)" }} interval={0} />
                  <YAxis tick={{ fontSize: 12, fill: "var(--color-faint)" }} tickLine={false} axisLine={false} width={64} tickFormatter={(v) => formatBRLCompact(v)} />
                  <Tooltip content={<RmeTip />} cursor={{ stroke: "var(--color-text-quaternary)", strokeDasharray: "3 3" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />
                  <Area type="monotone" dataKey="receita" name="Receita bruta" stroke={POSITIVE} strokeWidth={2.2} fill="url(#recGlow)" activeDot={{ r: 5 }} {...chartAnim()} />
                  <Line type="monotone" dataKey="mc" name="Margem de contribuição" stroke={ORANGE} strokeWidth={2} dot={false} activeDot={{ r: 5 }} {...chartAnim(120)} />
                  <Line type="monotone" dataKey="ebitda" name="EBITDA" stroke={INK} strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 5 }} {...chartAnim(240)} />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>

            <span className="text-caption text-faint">CAC e LTV são aproximações do período (marketing÷clientes e receita bruta÷clientes, contando só clientes com lançamento na Receita Bruta). Receita, margem de contribuição e EBITDA são as linhas do DRE — a classificação segue o plano de contas declarado e, sem ele, a palavra-chave da categoria.</span>
          </>
        )}
      </div>
    </AppShell>
  );
}

const fmtRatio = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}×`);

function KpiCard({ titulo, rows, info }: { titulo: string; rows: [string, React.ReactNode][]; info?: InfoConteudo }) {
  return (
    <Card className="flex flex-col gap-2" info={info}>
      <span className="text-caption font-semibold tracking-wide" style={{ color: POSITIVE }}>{titulo}</span>
      <div className="flex flex-col">
        {rows.map(([k, v], i) => (
          <div key={k} className={`flex items-center justify-between gap-3 py-[7px] ${i ? "border-t border-border-soft" : ""}`}>
            <span className="text-[15px] text-muted">{k}</span>
            <span className="text-[15px] font-medium tabular-nums text-ink">{v}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function DestaqueCard({ titulo, rows, tint, info }: { titulo: string; rows: [string, React.ReactNode][]; tint: "lime" | "negativo"; info?: InfoConteudo }) {
  const isNeg = tint === "negativo";
  const bg = isNeg ? "rgba(194,71,61,0.08)" : "var(--color-lime-tint)";
  const cor = isNeg ? "var(--color-negative)" : POSITIVE;
  return (
    <Card className="flex flex-col gap-2" style={{ background: bg }} info={info}>
      <span className="text-caption font-semibold tracking-wide" style={{ color: cor }}>{titulo}</span>
      <div className="flex flex-col">
        {rows.map(([k, v], i) => (
          <div key={k} className={`flex items-center justify-between gap-3 py-[7px] ${i ? "border-t border-border-soft" : ""}`}>
            <span className="text-[15px] text-muted">{k}</span>
            <span className="text-[16px] font-semibold tabular-nums text-ink">{v}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ChartCard({ titulo, onClose, children, info }: { titulo: string; onClose: () => void; children: React.ReactNode; info?: InfoConteudo }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1 text-[16px] font-semibold text-ink">{titulo}{info && <InfoHint align="left" {...info} />}</span>
        <button onClick={onClose} aria-label={`Ocultar ${titulo}`} className="w-7 h-7 rounded-md inline-flex items-center justify-center text-faint hover:text-ink hover:bg-surface-2 transition-colors"><Icon name="x" size={16} color="currentColor" /></button>
      </div>
      {children}
    </Card>
  );
}

function DiaTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-card border border-border px-3 py-[10px] text-caption" style={{ boxShadow: "0 6px 20px rgba(14,19,30,0.12)" }}>
      <div className="font-medium text-ink mb-1">{label}</div>
      <div className="text-muted tabular-nums">{formatBRL(Number(payload[0].value))}</div>
    </div>
  );
}

function RmeTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-card border border-border px-4 py-3 text-caption" style={{ boxShadow: "0 6px 20px rgba(14,19,30,0.14)" }}>
      <div className="text-[15px] font-semibold text-ink mb-2">{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center justify-between gap-6 tabular-nums py-[2px]">
          <span className="inline-flex items-center gap-[6px] text-muted"><span className="w-2 h-2 rounded-pill" style={{ background: p.color }} />{p.name}</span>
          <span className="text-ink font-medium">{formatBRL(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
}
