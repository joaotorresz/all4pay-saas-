"use client";

/**
 * Relatórios sobre o RAZÃO (Fase 2): DRE gerencial, Balanço patrimonial e pivot
 * por dimensão — todos lendo os lançamentos de dupla entrada (journal_lines via
 * getLedgerEntries). O razão é a fonte da verdade. Demo e live.
 */
import * as React from "react";
import Link from "next/link";
import { Card, BRL, StatusBadge, Select, DatePicker, Skeleton, InfoHint } from "@/components/ui";
import { getLedgerEntries, dreDoRazao, balancoDoRazao, pivotDoRazao, type RazaoLancamento } from "@/lib/ledger";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { AppShell } from "@/components/app/AppShell";

const isoDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function RelatoriosRazaoView() {
  const [entries, setEntries] = React.useState<RazaoLancamento[] | null>(null);
  const [ate, setAte] = React.useState(isoDia(new Date()));
  const [de, setDe] = React.useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 11); d.setDate(1); return isoDia(d); });
  const [dim, setDim] = React.useState("contraparte");

  React.useEffect(() => { getLedgerEntries().then(setEntries).catch(() => setEntries([])); }, []);

  const dre = React.useMemo(() => (entries ? dreDoRazao(entries, de, ate) : null), [entries, de, ate]);
  const balanco = React.useMemo(() => (entries ? balancoDoRazao(entries, ate) : null), [entries, ate]);
  const pivot = React.useMemo(() => (entries ? pivotDoRazao(entries, dim, de, ate) : []), [entries, dim, de, ate]);

  return (
    <AppShell title="Relatórios (Razão)" crumb="Contabilidade" actions={isDemo ? <DemoBadge /> : null}>
      <div className="flex flex-col gap-5 pb-4">
        <Card className="flex flex-wrap items-end gap-x-3 gap-y-2">
          <DatePicker label="De" value={de} onChange={setDe} max={ate} containerClassName="min-w-[150px]" />
          <DatePicker label="Até" value={ate} onChange={setAte} min={de} containerClassName="min-w-[150px]" />
          <span className="text-caption text-faint self-center ml-auto">Fonte: razão de dupla entrada</span>
        </Card>

        {entries === null ? (
          <Card><Skeleton className="h-40 w-full" /></Card>
        ) : entries.length === 0 ? (
          <Card className="flex flex-col items-start gap-2">
            <span className="text-h3 font-medium text-ink">Razão vazio</span>
            <span className="text-caption text-muted">Lance um movimento ou importe dados — o razão projeta automaticamente e os relatórios são calculados a partir dele.</span>
            <Link href="/razao" className="text-label font-medium text-ink underline">Ir para o Razão →</Link>
          </Card>
        ) : (
          <>
            {/* DRE unificado: vive em /dre (razão = projeção dos movimentos, números reconciliam) */}
            <Card className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex flex-col">
                <span className="text-label font-medium text-muted inline-flex items-center gap-1">Resultado do período<InfoHint align="left" titulo="Resultado do período" oQue="Lucro ou prejuízo no intervalo escolhido, conforme o razão." comoCalcula="Receita menos despesa do período, lendo as contas de resultado dos lançamentos." /></span>
                <span className="text-[24px] leading-none font-semibold tabular-nums" style={{ color: dre!.resultado >= 0 ? "var(--color-positive)" : "var(--color-negative)" }}><BRL value={dre!.resultado} /></span>
                <span className="text-caption text-faint tabular-nums">receita <BRL value={dre!.receita} /> · despesa <BRL value={dre!.despesa} /></span>
              </div>
              <Link href="/dre" className="text-label font-medium text-ink underline">Ver DRE completo →</Link>
            </Card>

            {/* Orçado × Realizado vive em /orcamento (flux analysis único) */}
            <Card className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex flex-col">
                <span className="text-label font-medium text-muted inline-flex items-center gap-1">Orçado × Realizado<InfoHint align="left" titulo="Orçado × Realizado" oQue="Compara o que foi planejado no orçamento com o que de fato aconteceu." comoCalcula="A análise de variação por linha vive na tela de orçamento; aqui é o atalho para abri-la." /></span>
                <span className="text-caption text-faint">Análise de variação com flux (orçamento mensal por linha + drill-down).</span>
              </div>
              <Link href="/orcamento" className="text-label font-medium text-ink underline">Abrir orçamento →</Link>
            </Card>

            {/* Balanço patrimonial */}
            <Card className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-label font-medium text-muted inline-flex items-center gap-1">Balanço patrimonial · até {ate.split("-").reverse().join("/")}<InfoHint align="left" titulo="Balanço patrimonial" oQue="Foto do que a empresa tem e deve numa data: ativos, passivos e patrimônio líquido." comoCalcula="Acumula os saldos das contas patrimoniais do razão até a data; fecha quando ativo é igual a passivo mais patrimônio líquido." /></span>
                <StatusBadge tone={balanco!.fecha ? "positive" : "warning"}>{balanco!.fecha ? "Ativo = Passivo + PL ✓" : "Não fecha"}</StatusBadge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {balanco!.grupos.map((g) => (
                  <div key={g.titulo} className="flex flex-col gap-1">
                    <div className="flex justify-between text-label font-medium text-ink border-b border-border-soft pb-1">
                      <span>{g.titulo}</span><span className="tabular-nums"><BRL value={g.total} /></span>
                    </div>
                    {g.contas.map((c, i) => (
                      <div key={i} className="flex justify-between text-caption">
                        <span className="text-muted truncate">{c.conta !== "—" ? `${c.conta} · ` : ""}{c.nome}</span>
                        <span className="tabular-nums text-faint shrink-0"><BRL value={c.valor} /></span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </Card>

            {/* Pivot por dimensão */}
            <Card className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="text-label font-medium text-muted inline-flex items-center gap-1">Pivot por dimensão<InfoHint align="left" titulo="Pivot por dimensão" oQue="Quebra receita, despesa e resultado por contraparte ou centro de custo." comoCalcula="Agrupa os lançamentos do período pela dimensão escolhida e soma receita e despesa de cada grupo." /></span>
                <Select value={dim} onChange={setDim} options={[{ value: "contraparte", label: "Contraparte" }, { value: "centro", label: "Centro de custo" }]} containerClassName="min-w-[170px]" />
              </div>
              {pivot.length === 0 ? (
                <span className="text-caption text-faint">Sem dados de dimensão no período.</span>
              ) : (
                <div className="flex flex-col">
                  <div className="hidden sm:flex items-center gap-3 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-faint border-b border-border-soft">
                    <span className="flex-1">{dim === "centro" ? "Centro de custo" : "Contraparte"}</span>
                    <span className="w-[120px] text-right">Receita</span>
                    <span className="w-[120px] text-right">Despesa</span>
                    <span className="w-[120px] text-right">Resultado</span>
                  </div>
                  {pivot.slice(0, 50).map((p) => (
                    <div key={p.chave} className="flex items-center gap-3 py-2 border-t border-border-soft text-caption first:border-t-0">
                      <span className="flex-1 truncate text-ink">{p.chave}</span>
                      <span className="hidden sm:block w-[120px] text-right tabular-nums text-positive"><BRL value={p.receita} /></span>
                      <span className="hidden sm:block w-[120px] text-right tabular-nums text-muted"><BRL value={p.despesa} /></span>
                      <span className={`w-[120px] text-right tabular-nums font-medium ${p.resultado >= 0 ? "text-ink" : "text-negative"}`}><BRL value={p.resultado} /></span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
