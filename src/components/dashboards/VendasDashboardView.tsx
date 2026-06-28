"use client";

/**
 * Dashboards › Vendas (modelo IULI, Fig.2) — KPIs de negócios digitais:
 * Faturamento Bruto · EBITDA (% receita) · Reembolsos · Chargebacks · CAC · LTV ·
 * LTV/CAC, além de vendas por mês. Derivado dos lançamentos (getRiscoInput) +
 * camada quant. Demo/live idêntico. Aproximações explicáveis (CAC/LTV).
 */
import * as React from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import { AppShell } from "@/components/app/AppShell";
import { Card, Skeleton } from "@/components/ui";
import { useRiscoInput, useQuantitativo } from "@/components/visao-geral/hooks";
import { formatBRL, formatBRLCompact } from "@/lib/format";
import { MES_ABBR } from "@/components/visao-geral/PeriodContext";

export function VendasDashboardView() {
  const { data, isLoading } = useRiscoInput();
  const q = useQuantitativo();

  const calc = React.useMemo(() => {
    if (!data) return null;
    const hoje = new Date(data.hoje + "T00:00:00");
    const meses: { ym: string; label: string; receita: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      meses.push({ ym: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: `${MES_ABBR[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`, receita: 0 });
    }
    const idx = new Map(meses.map((m, i) => [m.ym, i]));
    let faturamento = 0, reembolsos = 0, chargebacks = 0, marketing = 0;
    const clientes = new Set<string>();
    for (const mv of data.movements) {
      const cat = (mv.category || "").toLowerCase();
      const v = Math.abs(mv.amount);
      if (mv.type === "entrada") {
        faturamento += v;
        if (mv.party_id) clientes.add(mv.party_id);
        const i = idx.get((mv.due_date || "").slice(0, 7));
        if (i != null) meses[i].receita += v;
      } else {
        if (/reembol/.test(cat)) reembolsos += v;
        if (/chargeback|estorno/.test(cat)) chargebacks += v;
        if (/marketing|ads|facebook|google/.test(cat)) marketing += v;
      }
    }
    const nClientes = Math.max(1, clientes.size);
    const ltv = faturamento / nClientes; // receita média por cliente
    const cac = marketing / nClientes; // custo de aquisição médio
    const ltvCac = cac > 0 ? ltv / cac : 0;
    const ebitdaPct = q.data?.indicadores ? q.data.indicadores.margemOperacional : 0;
    return { meses, faturamento, reembolsos, chargebacks, ltv, cac, ltvCac, nClientes, ebitdaPct };
  }, [data, q.data]);

  return (
    <AppShell title="Dashboard de Vendas">
      <div className="flex flex-col gap-5 pb-6">
        {isLoading || !calc ? (
          <Card><Skeleton className="h-64 w-full" /></Card>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Kpi label="Faturamento bruto" v={formatBRL(calc.faturamento)} destaque />
              <Kpi label="EBITDA (% receita)" v={`${(calc.ebitdaPct * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`} />
              <Kpi label="Reembolsos" v={formatBRL(calc.reembolsos)} tone="var(--color-negative)" />
              <Kpi label="Chargebacks" v={formatBRL(calc.chargebacks)} tone="var(--color-negative)" />
              <Kpi label="CAC" v={formatBRL(calc.cac)} sub="custo de aquisição médio" />
              <Kpi label="LTV" v={formatBRL(calc.ltv)} sub="receita média por cliente" />
              <Kpi label="LTV / CAC" v={`${calc.ltvCac.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}×`} tone="var(--color-positive)" />
              <Kpi label="Clientes" v={String(calc.nClientes)} />
            </div>

            <Card className="flex flex-col gap-3">
              <span className="text-label font-medium text-muted">Vendas por mês (12 meses)</span>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={calc.meses} margin={{ top: 8, right: 8, bottom: 0, left: -6 }}>
                  <CartesianGrid stroke="var(--color-border-soft)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--color-text-tertiary)" }} tickLine={false} axisLine={{ stroke: "var(--color-border-soft)" }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 12, fill: "var(--color-text-tertiary)" }} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => formatBRLCompact(v)} />
                  <Tooltip cursor={{ fill: "rgba(0,0,0,0.03)" }} content={({ active, payload, label }: any) => active && payload?.length ? (
                    <div className="bg-white rounded-card border border-border px-3 py-[10px] text-caption" style={{ boxShadow: "0 6px 20px rgba(14,19,30,0.12)" }}>
                      <div className="font-medium text-ink mb-1 capitalize">{label}</div>
                      <div className="text-muted tabular-nums">{formatBRL(Number(payload[0].value))}</div>
                    </div>
                  ) : null} />
                  <Bar dataKey="receita" radius={[6, 6, 6, 6]} maxBarSize={26}>
                    {calc.meses.map((_, i) => <Cell key={i} fill="var(--color-positive)" />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <span className="text-caption text-faint">CAC e LTV são aproximações (marketing/clientes e receita/clientes); refinam com a base de clientes e custos categorizados.</span>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Kpi({ label, v, sub, tone = "var(--color-ink)", destaque }: { label: string; v: string; sub?: string; tone?: string; destaque?: boolean }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-caption text-faint">{label}</span>
      <span className={`${destaque ? "text-[24px]" : "text-[20px]"} font-semibold tabular-nums`} style={{ color: tone }}>{v}</span>
      {sub && <span className="text-[11px] text-faint">{sub}</span>}
    </Card>
  );
}
