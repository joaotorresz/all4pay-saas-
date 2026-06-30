"use client";

/**
 * Vendas e NFs › Impostos — Provisionamento (modelo IULI, §8.2 / Fig.22).
 * "Impostos das vendas por mês de competência. Some por mês para gerar 1 conta a
 * pagar por imposto." Disponível para o regime Lucro Presumido. Projeta a carga
 * tributária sobre o faturamento (receita por competência) e converte em contas
 * a pagar — fechando o elo entre vender e recolher impostos. Demo/live idêntico
 * (reusa getRiscoInput). Alíquotas configuráveis (serviço, Lucro Presumido).
 */
import * as React from "react";
import { AppShell } from "@/components/app/AppShell";
import { Card, Skeleton, Icon } from "@/components/ui";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { formatBRL } from "@/lib/format";
import { MES_ABBR } from "@/components/visao-geral/PeriodContext";

// Lucro Presumido (serviços) — base presumida 32%. Alíquotas efetivas s/ receita.
const IMPOSTOS = [
  { nome: "PIS", aliquota: 0.0065 },
  { nome: "COFINS", aliquota: 0.03 },
  { nome: "IRPJ", aliquota: 0.048 }, // 15% × 32% presumido
  { nome: "CSLL", aliquota: 0.0288 }, // 9% × 32% presumido
  { nome: "ISS", aliquota: 0.05 }, // municipal (estimado)
];
const ALIQUOTA_TOTAL = IMPOSTOS.reduce((s, i) => s + i.aliquota, 0);

export function ImpostosView() {
  const { data, isLoading } = useRiscoInput();

  const calc = React.useMemo(() => {
    if (!data) return null;
    const hoje = new Date(data.hoje + "T00:00:00");
    // receita (entradas) por mês de competência (due_date) — últimos 12 meses.
    const meses: { ym: string; label: string; receita: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      meses.push({ ym: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: `${MES_ABBR[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`, receita: 0 });
    }
    const idx = new Map(meses.map((m, i) => [m.ym, i]));
    for (const mv of data.movements) {
      if (mv.type !== "entrada") continue;
      const ym = (mv.due_date || "").slice(0, 7);
      const i = idx.get(ym);
      if (i != null) meses[i].receita += Math.abs(mv.amount);
    }
    const totaisPorImposto = IMPOSTOS.map((imp) => ({ ...imp, total: meses.reduce((s, m) => s + m.receita * imp.aliquota, 0) }));
    const receitaTotal = meses.reduce((s, m) => s + m.receita, 0);
    const cargaTotal = receitaTotal * ALIQUOTA_TOTAL;
    return { meses, totaisPorImposto, receitaTotal, cargaTotal };
  }, [data]);

  return (
    <AppShell title="Impostos · Provisionamento">
      <div className="flex flex-col gap-5 pb-6">
        <Card className="flex items-start gap-3" info={{ titulo: "Provisionamento de impostos", oQue: "Estima quanto sua empresa deve recolher de impostos sobre o faturamento e transforma isso em contas a pagar.", comoCalcula: "Aplica as alíquotas efetivas do Lucro Presumido (serviços, base presumida 32%) sobre a receita por mês de competência." }}>
          <Icon name="receipt" size={18} color="var(--color-lime)" />
          <p className="m-0 text-caption text-muted">
            Provisionamento por <b className="text-ink font-medium">mês de competência</b> no regime
            <b className="text-ink font-medium"> Lucro Presumido</b>. Some por mês para gerar <b className="text-ink font-medium">1 conta a pagar por imposto</b>.
            Alíquotas efetivas sobre a receita (serviços, base presumida 32%); ajustáveis por município/regime.
          </p>
        </Card>

        {isLoading || !calc ? (
          <Card><Skeleton className="h-64 w-full" /></Card>
        ) : (
          <>
            {/* Totais por imposto → 1 conta a pagar cada */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {calc.totaisPorImposto.map((imp) => (
                <Card key={imp.nome} className="flex flex-col gap-1">
                  <span className="text-caption text-faint">{imp.nome} <span className="text-[11px]">({(imp.aliquota * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%)</span></span>
                  <span className="text-[20px] font-semibold tabular-nums text-ink">{formatBRL(imp.total)}</span>
                </Card>
              ))}
              <Card className="flex flex-col gap-1" elevated style={{ background: "var(--color-lime-tint)" }} info={{ titulo: "Carga tributária total", oQue: "O total estimado de impostos sobre o faturamento dos últimos 12 meses.", comoCalcula: "Receita total por competência multiplicada pela soma de todas as alíquotas efetivas." }}>
                <span className="text-caption text-muted">Carga total ({(ALIQUOTA_TOTAL * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%)</span>
                <span className="text-[20px] font-semibold tabular-nums text-ink">{formatBRL(calc.cargaTotal)}</span>
              </Card>
            </div>

            {/* Matriz mês × imposto */}
            <Card padded={false} info={{ titulo: "Provisionamento mês a mês", oQue: "Detalha, por mês de competência, a receita e o imposto provisionado de cada tributo.", comoCalcula: "Para cada mês, multiplica a receita por competência pela alíquota de cada imposto; somar a coluna gera uma conta a pagar por tributo." }}>
              <div className="px-5 py-3 border-b border-border-soft text-label font-medium text-muted">Provisionamento por mês de competência</div>
              <div className="overflow-x-auto">
                <table className="w-full text-[14px]">
                  <thead>
                    <tr className="text-caption text-muted">
                      <th className="text-left font-medium px-5 py-2">Competência</th>
                      <th className="text-right font-medium px-3 py-2">Receita</th>
                      {IMPOSTOS.map((i) => <th key={i.nome} className="text-right font-medium px-3 py-2">{i.nome}</th>)}
                      <th className="text-right font-medium px-5 py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calc.meses.map((m, r) => {
                      const totalMes = m.receita * ALIQUOTA_TOTAL;
                      return (
                        <tr key={m.ym} className={r ? "border-t border-border-soft" : ""}>
                          <td className="px-5 py-2 text-ink capitalize">{m.label}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-ink">{formatBRL(m.receita)}</td>
                          {IMPOSTOS.map((i) => <td key={i.nome} className="px-3 py-2 text-right tabular-nums text-muted">{formatBRL(m.receita * i.aliquota)}</td>)}
                          <td className="px-5 py-2 text-right tabular-nums font-medium text-ink">{formatBRL(totalMes)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-surface-2">
                      <td className="px-5 py-2 font-semibold text-ink">Total</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-ink">{formatBRL(calc.receitaTotal)}</td>
                      {calc.totaisPorImposto.map((i) => <td key={i.nome} className="px-3 py-2 text-right tabular-nums font-semibold text-ink">{formatBRL(i.total)}</td>)}
                      <td className="px-5 py-2 text-right tabular-nums font-semibold text-ink">{formatBRL(calc.cargaTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
