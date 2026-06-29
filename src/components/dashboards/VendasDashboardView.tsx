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
 *  - Faturamento bruto = Σ entradas (competência, due_date) na janela.
 *  - LTV = receita da janela / clientes distintos da janela.
 *  - CAC = gasto de marketing da janela / clientes distintos da janela.
 *  - LTV/CAC = LTV÷CAC (0 quando CAC=0).
 *  - Margem de contribuição = receita − custos variáveis (CMV/comissão/taxa…).
 *  - EBITDA = receita − despesas operacionais (exclui financeiro, D&A e IRPJ/CSLL).
 *  - % Receita = EBITDA acumulado (YTD) ÷ receita acumulada (YTD).
 * CAC/LTV e o split de custo variável são aproximações por palavra-chave
 * (explicável; refina com base de clientes e custos categorizados).
 */
import * as React from "react";
import { ResponsiveContainer, ComposedChart, LineChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { AppShell } from "@/components/app/AppShell";
import { Card, Skeleton, Select, Icon } from "@/components/ui";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { formatBRL, formatBRLCompact } from "@/lib/format";
import { MES_ABBR } from "@/components/visao-geral/PeriodContext";

const POSITIVE = "var(--color-positive)";
const ORANGE = "var(--color-warning)";
const INK = "var(--color-ink)";
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const RE = {
  reembolso: /reembol/i,
  chargeback: /chargeback|estorno/i,
  marketing: /marketing|ads|an[úu]ncio|facebook|google|tr[áa]fego|publicidade|m[íi]dia/i,
  variavel: /cmv|custo|mercadoria|insumo|comiss|taxa|gateway|adquir|frete|fornecedor/i,
  // despesas FORA do EBITDA (financeiro, depreciação/amortização, IR/CSLL):
  foraEbitda: /juros|financ|empr[ée]st|deprecia|amortiz|irpj|csll|imposto de renda/i,
};

const effDate = (mv: { paid_date?: string | null; due_date: string }) => mv.due_date || mv.paid_date || "";

export function VendasDashboardView() {
  const { data, isLoading } = useRiscoInput();

  // seletor Mês/Ano — default no mês de "hoje"
  const hojeStr = data?.hoje ?? "2026-01-01";
  const [sel, setSel] = React.useState<string>(() => hojeStr.slice(0, 7)); // "YYYY-MM"
  React.useEffect(() => { setSel(hojeStr.slice(0, 7)); }, [hojeStr]);
  const [Y, M] = React.useMemo(() => { const [y, m] = sel.split("-").map(Number); return [y, m - 1]; }, [sel]); // M 0-based

  // [oculto] widgets removíveis (× no card), como no IULI
  const [hidSemana, setHidSemana] = React.useState(false);
  const [hidAno, setHidAno] = React.useState(false);

  // opções do seletor: de 18 meses atrás a 6 à frente
  const opcoes = React.useMemo(() => {
    const base = new Date(hojeStr + "T00:00:00");
    const out: { value: string; label: string }[] = [];
    // cronológico (mais antigo → mais recente): 18 meses atrás a 6 à frente
    for (let i = 18; i >= -6; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      out.push({ value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: `${MES_ABBR[d.getMonth()]} ${d.getFullYear()}` });
    }
    return out;
  }, [hojeStr]);
  const passo = (delta: number) => {
    const d = new Date(Y, M + delta, 1);
    setSel(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

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
    const monthly = Array.from({ length: 12 }, () => ({ receita: 0, despVar: 0, despOp: 0 }));
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
      const ds = effDate(mv); if (!ds) continue;
      const ym = ds.slice(0, 7);
      const y = Number(ds.slice(0, 4));
      const mi = Number(ds.slice(5, 7)) - 1;
      const cat = (mv.category || "").toLowerCase();
      const v = Math.abs(mv.amount);
      const inAno = y === Y;
      const inMes = ym === monthSel;
      const inTri = inAno && mi >= qStart && mi < qStart + 3;

      if (mv.type === "entrada") {
        if (inMes) { W.mes.receita += v; if (mv.party_id) W.mes.cli.add(mv.party_id); }
        if (inTri) { W.tri.receita += v; if (mv.party_id) W.tri.cli.add(mv.party_id); }
        if (inAno) { W.ano.receita += v; if (mv.party_id) W.ano.cli.add(mv.party_id); monthly[mi].receita += v; }
        // semana
        const d = new Date(ds + "T00:00:00");
        if (d >= domingo && d <= sabado) semana[d.getDay()].receita += v;
      } else {
        const ehMkt = RE.marketing.test(cat);
        const ehReemb = RE.reembolso.test(cat);
        const ehCharge = RE.chargeback.test(cat);
        if (ehMkt) { if (inMes) W.mes.marketing += v; if (inTri) W.tri.marketing += v; if (inAno) W.ano.marketing += v; }
        if (ehReemb) { if (inMes) reembMes += v; if (inAno) reembAno += v; }
        if (ehCharge) { if (inMes) chargeMes += v; if (inAno) chargeAno += v; }
        if (inAno) {
          if (RE.variavel.test(cat)) monthly[mi].despVar += v;
          if (!RE.foraEbitda.test(cat)) monthly[mi].despOp += v; // entra no EBITDA
        }
      }
    }

    const ltv = (w: { receita: number; cli: Set<string> }) => w.receita / Math.max(1, w.cli.size);
    const cac = (w: { marketing: number; cli: Set<string> }) => w.marketing / Math.max(1, w.cli.size);
    const ratio = (l: number, c: number) => (c > 0 ? l / c : 0);

    const cacMes = cac(W.mes), cacTri = cac(W.tri), cacAno = cac(W.ano);
    const ltvMes = ltv(W.mes), ltvTri = ltv(W.tri), ltvAno = ltv(W.ano);

    // EBITDA: mês, acumulado (YTD = jan..mês selecionado) e % receita
    const ebitdaMes = monthly[M].receita - monthly[M].despOp;
    let ebitdaAcum = 0, receitaAcum = 0;
    for (let i = 0; i <= M; i++) { ebitdaAcum += monthly[i].receita - monthly[i].despOp; receitaAcum += monthly[i].receita; }
    const pctReceita = receitaAcum > 0 ? ebitdaAcum / receitaAcum : 0;

    // séries dos gráficos
    const serieAno = monthly.map((m, i) => ({ mes: MES_ABBR[i], receita: m.receita }));
    const serieRME = monthly.map((m, i) => ({ mes: MES_ABBR[i], receita: m.receita, mc: m.receita - m.despVar, ebitda: m.receita - m.despOp }));

    return {
      faturamentoMes: W.mes.receita, reembMes, reembAno, chargeMes, chargeAno,
      cacMes, cacTri, cacAno, ltvMes, ltvTri, ltvAno,
      lcMes: ratio(ltvMes, cacMes), lcTri: ratio(ltvTri, cacTri), lcAno: ratio(ltvAno, cacAno),
      ebitdaMes, ebitdaAcum, pctReceita,
      serieAno, serieRME, semana,
    };
  }, [data, Y, M]);

  const seletor = (
    <div className="flex flex-col items-end gap-1">
      <span className="text-caption text-faint">Mês / Ano</span>
      <div className="flex items-center gap-2">
        <button onClick={() => passo(-1)} aria-label="Mês anterior" className="w-8 h-8 rounded-md inline-flex items-center justify-center bg-surface-2 hover:bg-surface-3 transition-colors"><Icon name="chevron-left" size={16} color="var(--color-muted)" /></button>
        <div className="min-w-[150px]"><Select value={sel} onChange={setSel} options={opcoes} /></div>
        <button onClick={() => passo(1)} aria-label="Próximo mês" className="w-8 h-8 rounded-md inline-flex items-center justify-center bg-surface-2 hover:bg-surface-3 transition-colors"><Icon name="chevron-right" size={16} color="var(--color-muted)" /></button>
      </div>
    </div>
  );

  return (
    <AppShell title="Dashboard de Vendas" actions={seletor}>
      <div className="flex flex-col gap-5 pb-6">
        <p className="m-0 -mt-1 text-caption text-muted">CAC · LTV · LTV/CAC · EBITDA · Receita · Reembolsos · Chargebacks.</p>

        {isLoading || !calc ? (
          <Card><Skeleton className="h-64 w-full" /></Card>
        ) : (
          <>
            {/* Linha 1 — KPIs CAC · LTV · LTV/CAC · EBITDA */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <KpiCard titulo="CAC" rows={[["Mês", formatBRL(calc.cacMes)], ["Trimestre", formatBRL(calc.cacTri)], ["Ano", formatBRL(calc.cacAno)]]} />
              <KpiCard titulo="LTV" rows={[["Mês", formatBRL(calc.ltvMes)], ["Trimestre", formatBRL(calc.ltvTri)], ["Ano", formatBRL(calc.ltvAno)]]} />
              <KpiCard titulo="LTV / CAC" rows={[["Mês", fmtRatio(calc.lcMes)], ["Trimestre", fmtRatio(calc.lcTri)], ["Ano", fmtRatio(calc.lcAno)]]} />
              <KpiCard titulo="EBITDA" rows={[["Mês", formatBRL(calc.ebitdaMes)], ["Acumulado", formatBRL(calc.ebitdaAcum)], ["% Receita", fmtPct(calc.pctReceita)]]} />
            </div>

            {/* Linha 2 — Faturamento · Reembolsos · Chargebacks */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <DestaqueCard titulo="Faturamento bruto" tint="lime" rows={[["Mês", formatBRL(calc.faturamentoMes)]]} />
              <DestaqueCard titulo="Reembolsos" tint="lime" rows={[["Mês", formatBRL(calc.reembMes)], ["Ano", formatBRL(calc.reembAno)]]} />
              <DestaqueCard titulo="Chargebacks" tint="negativo" rows={[["Mês", formatBRL(calc.chargeMes)], ["Ano", formatBRL(calc.chargeAno)]]} />
            </div>

            {/* Gráficos de linha — Vendas da semana · Vendas do ano */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {!hidSemana && (
                <ChartCard titulo="Vendas da semana" onClose={() => setHidSemana(true)}>
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={calc.semana} margin={{ top: 16, right: 12, bottom: 0, left: -6 }}>
                      <CartesianGrid stroke="var(--color-border-soft)" strokeDasharray="3 3" />
                      <XAxis dataKey="dia" tick={{ fontSize: 12, fill: "var(--color-faint)" }} tickLine={false} axisLine={{ stroke: "var(--color-border-soft)" }} />
                      <YAxis tick={{ fontSize: 12, fill: "var(--color-faint)" }} tickLine={false} axisLine={false} width={64} tickFormatter={(v) => formatBRLCompact(v)} />
                      <Tooltip content={<DiaTip />} cursor={{ stroke: "#c9cdd4", strokeDasharray: "3 3" }} />
                      <Line type="monotone" dataKey="receita" stroke={POSITIVE} strokeWidth={2.2} dot={{ r: 4, fill: "#fff", stroke: POSITIVE, strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
              {!hidAno && (
                <ChartCard titulo="Vendas do ano" onClose={() => setHidAno(true)}>
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={calc.serieAno} margin={{ top: 16, right: 12, bottom: 0, left: -6 }}>
                      <CartesianGrid stroke="var(--color-border-soft)" strokeDasharray="3 3" />
                      <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "var(--color-faint)" }} tickLine={false} axisLine={{ stroke: "var(--color-border-soft)" }} interval={0} />
                      <YAxis tick={{ fontSize: 12, fill: "var(--color-faint)" }} tickLine={false} axisLine={false} width={64} tickFormatter={(v) => formatBRLCompact(v)} />
                      <Tooltip content={<DiaTip />} cursor={{ stroke: "#c9cdd4", strokeDasharray: "3 3" }} />
                      <Line type="monotone" dataKey="receita" stroke={POSITIVE} strokeWidth={2.2} dot={{ r: 4, fill: "#fff", stroke: POSITIVE, strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
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
              <span className="text-[16px] font-semibold text-ink">Receita Bruta, Margem de Contribuição e EBITDA</span>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={calc.serieRME} margin={{ top: 16, right: 12, bottom: 0, left: -6 }}>
                  <defs>
                    <linearGradient id="recGlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#28AA00" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#28AA00" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--color-border-soft)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "var(--color-faint)" }} tickLine={false} axisLine={{ stroke: "var(--color-border-soft)" }} interval={0} />
                  <YAxis tick={{ fontSize: 12, fill: "var(--color-faint)" }} tickLine={false} axisLine={false} width={64} tickFormatter={(v) => formatBRLCompact(v)} />
                  <Tooltip content={<RmeTip />} cursor={{ stroke: "#c9cdd4", strokeDasharray: "3 3" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />
                  <Area type="monotone" dataKey="receita" name="Receita bruta" stroke={POSITIVE} strokeWidth={2.2} fill="url(#recGlow)" isAnimationActive={false} />
                  <Line type="monotone" dataKey="mc" name="Margem de contribuição" stroke={ORANGE} strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="ebitda" name="EBITDA" stroke={INK} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>

            <span className="text-caption text-faint">CAC e LTV são aproximações (marketing÷clientes e receita÷clientes); o split de custo variável (margem de contribuição) e a exclusão financeiro/D&A/IR no EBITDA são por palavra-chave — refinam com a base de clientes e os custos categorizados.</span>
          </>
        )}
      </div>
    </AppShell>
  );
}

const fmtRatio = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

function KpiCard({ titulo, rows }: { titulo: string; rows: [string, string][] }) {
  return (
    <Card className="flex flex-col gap-2">
      <span className="text-caption font-semibold tracking-wide uppercase" style={{ color: POSITIVE }}>{titulo}</span>
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

function DestaqueCard({ titulo, rows, tint }: { titulo: string; rows: [string, string][]; tint: "lime" | "negativo" }) {
  const isNeg = tint === "negativo";
  const bg = isNeg ? "rgba(194,71,61,0.08)" : "var(--color-lime-tint)";
  const cor = isNeg ? "var(--color-negative)" : POSITIVE;
  return (
    <Card className="flex flex-col gap-2" style={{ background: bg }}>
      <span className="text-caption font-semibold tracking-wide uppercase" style={{ color: cor }}>{titulo}</span>
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

function ChartCard({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[16px] font-semibold text-ink">{titulo}</span>
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
