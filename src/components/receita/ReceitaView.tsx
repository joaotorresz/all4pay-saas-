"use client";

/**
 * Reconhecimento de receita (IFRS 15/CPC 47) + receita diferida + waterfall de
 * MRR/ARR. Reusa os contratos de recorrência (funil RECEBER). Demo-safe.
 */
import * as React from "react";
import Link from "next/link";
import { Card, BRL, StatusBadge, Icon, Skeleton, Button } from "@/components/ui";
import { listRecorrencias, rolarRecorrencias, totalFatura, CICLOS } from "@/lib/recorrencias";
import { postarLancamento } from "@/lib/ledger";
import { analisarReceita, type ContratoReceita, type ReceitaReport } from "@/core/revenue";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { AppShell } from "@/components/app/AppShell";
import { RevRecSection } from "./RevRecSection";

const cicloMesesDe = (ciclo: string) => CICLOS.find((c) => c.id === ciclo)?.meses ?? 1;

export function ReceitaReconhecimentoView() {
  const [report, setReport] = React.useState<ReceitaReport | null>(null);
  const [carregando, setCarregando] = React.useState(true);
  const [reconhecendo, setReconhecendo] = React.useState(false);
  const [msgRec, setMsgRec] = React.useState<string | null>(null);

  const reconhecerNoRazao = async () => {
    if (!report) return;
    setReconhecendo(true); setMsgRec(null);
    const mes = new Date().toISOString().slice(0, 7);
    try {
      let n = 0;
      for (const c of report.contratos.filter((x) => x.ativo && x.mrr > 0)) {
        await postarLancamento({
          entryDate: `${mes}-01`,
          description: `Reconhecimento de receita: ${c.titulo}`,
          source: "revrec",
          externalKey: `revrec:${c.id}:${mes}`,
          lines: [{ accountId: "2.2.01", debit: c.mrr }, { accountId: "3.1.02", credit: c.mrr }],
        });
        n++;
      }
      setMsgRec(`Competência de ${mes} reconhecida: ${n} contrato(s) lançado(s) no razão.`);
    } catch (e) { setMsgRec(`Falha: ${(e as Error).message}`); }
    finally { setReconhecendo(false); }
  };

  React.useEffect(() => {
    let ativo = true;
    rolarRecorrencias().then(() => {
      if (!ativo) return;
      const contratos: ContratoReceita[] = listRecorrencias().map((r) => ({
        id: r.id,
        titulo: r.titulo,
        clienteNome: r.clienteNome,
        valorCiclo: totalFatura(r),
        cicloMeses: cicloMesesDe(r.ciclo),
        inicio: r.criadoEm,
        ativo: r.status === "ativa",
      }));
      setReport(analisarReceita(contratos, new Date().toISOString().slice(0, 10)));
      setCarregando(false);
    });
    return () => { ativo = false; };
  }, []);

  const maxMrr = report ? Math.max(1, ...report.waterfall.map((p) => p.mrrFim)) : 1;

  return (
    <AppShell title="Reconhecimento de receita" crumb="Relatórios" actions={isDemo ? <DemoBadge /> : null}>
      <div className="flex flex-col gap-8">
      {carregando || !report ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-5">{[0, 1, 2, 3].map((i) => <Card key={i}><Skeleton className="h-16 w-full" /></Card>)}</div>
          <Card><Skeleton className="h-40 w-full" /></Card>
        </div>
      ) : report.contratos.length === 0 ? (
        <Card className="flex flex-col items-start gap-3">
          <span className="text-h3 font-medium text-ink">Sem contratos de recorrência</span>
          <span className="text-caption text-muted">O reconhecimento de receita usa os contratos do funil RECEBER. Crie uma recorrência para ver MRR, ARR, receita diferida e o waterfall.</span>
          <Link href="/recorrencias" className="text-label font-medium text-ink underline">Ir para Recorrências →</Link>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="primary" onClick={reconhecerNoRazao} disabled={reconhecendo} leftIcon={<Icon name="check" size={15} />}>
              {reconhecendo ? "Reconhecendo…" : "Reconhecer competência no razão"}
            </Button>
            {msgRec && <span className="text-caption text-positive">{msgRec}</span>}
          </div>
          {/* Resumo */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
            <Resumo label="MRR" valor={report.resumo.mrr} />
            <Resumo label="ARR" valor={report.resumo.arr} />
            <Resumo label="Receita diferida" valor={report.resumo.diferidaTotal} />
            <Resumo label="Reconhecida no mês" valor={report.resumo.reconhecidaMes} />
          </div>

          {/* Waterfall de receita recorrente */}
          <Card className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-label font-medium text-muted">Waterfall de receita recorrente (MRR)</span>
              {report.resumo.churnMrr > 0 && (
                <span className="text-caption text-faint">MRR cancelado (churn atual): <span className="tabular-nums text-negative"><BRL value={report.resumo.churnMrr} /></span></span>
              )}
            </div>
            <div className="flex items-end gap-3 h-[160px] pt-2" role="img" aria-label="Evolução do MRR nos últimos meses">
              {report.waterfall.map((p) => (
                <div key={p.mes} className="flex-1 flex flex-col items-center justify-end gap-2 min-w-0">
                  <span className="text-[12px] tabular-nums text-faint truncate">{Math.round(p.mrrFim / 1000)}k</span>
                  <div className="w-full rounded-t-sm bg-lime" style={{ height: `${Math.max(4, (p.mrrFim / maxMrr) * 120)}px` }} title={`MRR ${Math.round(p.mrrFim)}`} />
                  <span className="text-[12px] text-faint truncate">{p.label}</span>
                </div>
              ))}
            </div>
            <span className="text-caption text-faint">Barras = MRR ao fim de cada mês (contratos ativos iniciados até o mês). Novos contratos elevam a barra.</span>
          </Card>

          {/* Reconhecimento por contrato + diferida */}
          <Card padded={false}>
            <div className="hidden sm:flex items-center gap-3 px-5 py-2 text-caption font-medium text-muted border-b border-border-soft">
              <span className="flex-1">Contrato</span>
              <span className="w-[110px] text-right">MRR</span>
              <span className="w-[120px] text-right">Diferida</span>
              <span className="w-[130px] text-right">Ciclo atual</span>
            </div>
            {report.contratos.map((c, i) => (
              <div key={c.id} className={`flex items-center gap-3 px-3 sm:px-5 py-3 ${i ? "border-t border-border-soft" : ""}`}>
                <div className="flex-1 min-w-0">
                  <div className="text-[16px] font-medium text-ink truncate inline-flex items-center gap-2">
                    {c.titulo}
                    {!c.ativo && <StatusBadge tone="neutral">inativo</StatusBadge>}
                  </div>
                  <div className="text-caption text-faint truncate">
                    {c.clienteNome || "—"} · ciclo {c.cicloMeses}m
                    <span className="sm:hidden tabular-nums"> · MRR <BRL value={c.mrr} /> · diferida <BRL value={c.diferida} /></span>
                  </div>
                </div>
                <span className="hidden sm:block w-[110px] text-right tabular-nums text-ink"><BRL value={c.mrr} /></span>
                <span className="hidden sm:block w-[120px] text-right tabular-nums text-muted"><BRL value={c.diferida} /></span>
                <span className="w-[130px] shrink-0">
                  <div className="h-[5px] rounded-pill bg-surface-2 overflow-hidden">
                    <div className="h-full rounded-pill bg-ink" style={{ width: `${Math.round(c.pctCiclo * 100)}%` }} />
                  </div>
                  <span className="text-[12px] text-faint tabular-nums">{Math.min(c.mesNoCiclo + 1, c.cicloMeses)}/{c.cicloMeses} m</span>
                </span>
              </div>
            ))}
            <div className="px-5 py-3 border-t border-border-soft text-caption text-faint">
              Receita reconhecida ao longo da obrigação (1/ciclo por mês). A parte faturada e ainda não reconhecida é a <b className="text-muted font-medium">receita diferida</b> (passivo).
            </div>
          </Card>
        </div>
      )}
      <RevRecSection />
      </div>
    </AppShell>
  );
}

function Resumo({ label, valor }: { label: string; valor: number }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-caption text-faint">{label}</span>
      <span className="text-[22px] font-semibold text-ink tabular-nums"><BRL value={valor} /></span>
    </Card>
  );
}
