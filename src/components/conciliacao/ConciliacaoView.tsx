"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Icon, BRL, Button, Skeleton } from "@/components/ui";
import { useToast } from "@/components/listas/ListChrome";
import { isDemo } from "@/lib/demo";
import { getConciliacaoOF, conciliar, type MatchConc } from "@/lib/conciliacao-of";
import { EmptyState } from "@/components/visao-geral/shared";

const fmtDia = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y.slice(2)}`; };
const AUTO = 85;
const confCor = (c: number) => (c >= AUTO ? "var(--color-positive)" : c >= 60 ? "var(--color-warning)" : "var(--color-negative)");

/** Conciliação Open Finance — casa transações do banco com os títulos pendentes
 *  (a receber/a pagar) e dá BAIXA AUTOMÁTICA, sem contar o mesmo dinheiro 2x. */
export function ConciliacaoView() {
  const qc = useQueryClient();
  const { show, node } = useToast();
  const conc = useQuery({ queryKey: ["conciliacao-of"], queryFn: getConciliacaoOF });
  const [busy, setBusy] = React.useState<string | null>(null);

  const aplicar = async (m: MatchConc) => {
    setBusy(m.ofId);
    try { await conciliar(m.pendId, m.ofId); show("Conciliado — baixa no título previsto"); await qc.invalidateQueries(); }
    catch { show("Não foi possível conciliar"); }
    finally { setBusy(null); }
  };
  const aplicarAuto = async (matches: MatchConc[]) => {
    const auto = matches.filter((m) => m.confianca >= AUTO);
    if (!auto.length) return;
    setBusy("auto");
    try {
      for (const m of auto) await conciliar(m.pendId, m.ofId);
      show(`${auto.length} conciliação(ões) automática(s) aplicada(s)`);
      await qc.invalidateQueries();
    } catch { show("Falha na conciliação automática"); }
    finally { setBusy(null); }
  };

  if (isDemo) {
    return (
      <Card>
        <EmptyState icon="repeat" title="Conciliação roda com o Open Finance (live)"
          hint="Conecte um banco em Open Finance: as transações reais são casadas com os títulos a receber/a pagar e recebem baixa automática, sem duplicar o saldo. Em demonstração não há conexão bancária." />
      </Card>
    );
  }
  if (conc.isLoading) return <Skeleton className="h-[260px] w-full" rounded="md" />;
  if (conc.isError || !conc.data) return <Card><EmptyState title="Não foi possível carregar a conciliação" /></Card>;

  const { matches, pendentesSemMatch, ofSemMatch } = conc.data;
  const autos = matches.filter((m) => m.confianca >= AUTO).length;

  return (
    <div className="flex flex-col gap-4 pb-4">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
          <Stat label="Pares encontrados" v={String(matches.length)} />
          <Stat label="Auto (≥85%)" v={String(autos)} tone="var(--color-positive)" />
          <Stat label="Títulos sem par" v={String(pendentesSemMatch)} />
          <Stat label="Transações OF sem par" v={String(ofSemMatch)} />
        </div>
        {autos > 0 && (
          <Button size="sm" variant="primary" disabled={busy === "auto"} onClick={() => aplicarAuto(matches)}>
            {busy === "auto" ? "Conciliando…" : `Conciliar ${autos} automaticamente`}
          </Button>
        )}
      </Card>

      {matches.length === 0 ? (
        <Card><EmptyState icon="check" title="Nada a conciliar" hint="Sem transações do Open Finance casando com títulos pendentes no momento." /></Card>
      ) : (
        <Card padded={false}>
          <div className="hidden md:grid grid-cols-[1.4fr_1.4fr_0.8fr_0.9fr_0.8fr] gap-3 px-5 py-2 text-caption text-faint border-b border-border-soft">
            <span>Título previsto</span><span>Transação no banco</span><span className="text-right">Valor</span><span className="text-center">Confiança</span><span />
          </div>
          {matches.map((m, i) => (
            <div key={m.ofId} className={`grid grid-cols-1 md:grid-cols-[1.4fr_1.4fr_0.8fr_0.9fr_0.8fr] gap-3 items-center px-5 py-3 ${i ? "border-t border-border-soft" : ""}`}>
              <div className="min-w-0">
                <div className="text-[14px] text-ink truncate">{m.pendDesc}</div>
                <div className="text-caption text-faint">vence {fmtDia(m.dueDate)}</div>
              </div>
              <div className="min-w-0">
                <div className="text-[14px] text-ink truncate inline-flex items-center gap-1"><Icon name="building" size={12} color="var(--color-text-tertiary)" />{m.ofDesc}</div>
                <div className="text-caption text-faint">{m.tipo === "entrada" ? "recebido" : "pago"} {fmtDia(m.ofData)}</div>
              </div>
              <span className="text-caption tabular-nums md:text-right" style={{ color: m.tipo === "entrada" ? "var(--color-positive)" : "var(--color-negative)" }}>
                {m.tipo === "entrada" ? "+" : "−"}<BRL value={m.amount} />
              </span>
              <span className="text-caption tabular-nums md:text-center font-medium" style={{ color: confCor(m.confianca) }}>{m.confianca}%</span>
              <span className="md:text-right">
                <Button size="sm" variant="secondary" disabled={busy === m.ofId} onClick={() => aplicar(m)}>{busy === m.ofId ? "…" : "Conciliar"}</Button>
              </span>
            </div>
          ))}
        </Card>
      )}

      <span className="text-caption text-faint">
        Ao conciliar, o título previsto recebe baixa (vai para a Lixeira, recuperável) e a transação do banco assume a classificação dele — o dinheiro conta uma vez só.
      </span>
      {node}
    </div>
  );
}

function Stat({ label, v, tone = "var(--color-ink)" }: { label: string; v: string; tone?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-caption text-faint">{label}</span>
      <span className="text-h3 font-medium tabular-nums leading-none" style={{ color: tone }}>{v}</span>
    </div>
  );
}
