"use client";

/**
 * Conciliação (aba Conciliar da Entrada de dados) — casa transações do banco
 * (Open Finance) com os títulos previstos e dá BAIXA, sem contar o dinheiro 2x.
 * Revisão & confirmação no MESMO padrão do Open Finance / revisão do upload:
 * cards de resumo no topo, lista por par com chips e StatusBadge de confiança
 * (alta/média/baixa) e ação por linha. Em demo, mostra uma amostra.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Icon, BRL, Button, StatusBadge, Skeleton } from "@/components/ui";
import { useToast } from "@/components/listas/ListChrome";
import { isDemo } from "@/lib/demo";
import { getConciliacaoOF, conciliar, type MatchConc } from "@/lib/conciliacao-of";
import { EmptyState } from "@/components/visao-geral/shared";

const fmtDia = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y.slice(2)}`; };
const AUTO = 85;
const confTone = (c: number) => (c >= AUTO ? "positive" : c >= 60 ? "warning" : "neutral");
const confLabel = (c: number) => (c >= AUTO ? "alta" : c >= 60 ? "média" : "baixa");

export function ConciliacaoView() {
  const qc = useQueryClient();
  const { show, node } = useToast();
  const conc = useQuery({ queryKey: ["conciliacao-of"], queryFn: getConciliacaoOF });
  const [busy, setBusy] = React.useState<string | null>(null);
  const [feitos, setFeitos] = React.useState<Set<string>>(new Set()); // baixa imediata (otimista)

  const marcarFeito = (ids: string[]) => setFeitos((s) => { const n = new Set(s); ids.forEach((id) => n.add(id)); return n; });

  const aplicar = async (m: MatchConc) => {
    setBusy(m.ofId);
    try {
      await conciliar(m.pendId, m.ofId);
      marcarFeito([m.ofId]);
      show("Conciliado — baixa no título previsto");
      if (!isDemo) await qc.invalidateQueries();
    } catch { show("Não foi possível conciliar"); }
    finally { setBusy(null); }
  };
  const aplicarAuto = async (matches: MatchConc[]) => {
    const auto = matches.filter((m) => m.confianca >= AUTO && !feitos.has(m.ofId));
    if (!auto.length) return;
    setBusy("auto");
    try {
      for (const m of auto) await conciliar(m.pendId, m.ofId);
      marcarFeito(auto.map((m) => m.ofId));
      show(`${auto.length} conciliação(ões) automática(s) aplicada(s)`);
      if (!isDemo) await qc.invalidateQueries();
    } catch { show("Falha na conciliação automática"); }
    finally { setBusy(null); }
  };

  if (conc.isLoading) return <Skeleton className="h-[260px] w-full" rounded="md" />;
  if (conc.isError || !conc.data) return <Card><EmptyState title="Não foi possível carregar a conciliação" /></Card>;

  const { pendentesSemMatch, ofSemMatch } = conc.data;
  const matches = conc.data.matches.filter((m) => !feitos.has(m.ofId));
  const autos = matches.filter((m) => m.confianca >= AUTO).length;
  const totalEntrada = matches.filter((m) => m.tipo === "entrada").reduce((s, m) => s + m.amount, 0);
  const totalSaida = matches.filter((m) => m.tipo === "saida").reduce((s, m) => s + m.amount, 0);

  return (
    <div className="flex flex-col gap-5 pb-4">
      {/* Resumo (mesmo padrão da revisão do upload / Open Finance) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Resumo label="Pares encontrados" valor={matches.length} contagem />
        <Resumo label="Conciliável agora" valor={autos} contagem tone="var(--color-positive)" />
        <Resumo label="A receber" valor={totalEntrada} />
        <Resumo label="A pagar" valor={totalSaida} />
        <Resumo label="Sem par" valor={pendentesSemMatch + ofSemMatch} contagem />
      </div>

      {isDemo && (
        <span className="text-caption text-faint inline-flex items-center gap-2">
          <Icon name="sparkles" size={14} color="var(--color-lime)" /> Amostra de demonstração — em live, os pares vêm das transações reais do Open Finance.
        </span>
      )}

      {matches.length === 0 ? (
        <Card><EmptyState icon="check" title="Nada a conciliar" hint="Sem transações do Open Finance casando com títulos pendentes no momento." /></Card>
      ) : (
        <Card padded={false}>
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border-soft">
            <span className="text-label font-medium text-muted">Pares para conciliar — revise a confiança e confirme</span>
            {autos > 0 && (
              <Button size="sm" variant="primary" disabled={busy === "auto"} onClick={() => aplicarAuto(conc.data!.matches)} leftIcon={<Icon name="check" size={14} />}>
                {busy === "auto" ? "Conciliando…" : `Conciliar ${autos} de confiança alta`}
              </Button>
            )}
          </div>
          {matches.map((m, i) => (
            <div key={m.ofId} className={`grid grid-cols-1 md:grid-cols-[1.4fr_1.4fr_auto_auto_auto] gap-3 md:items-center px-3 sm:px-5 py-3 ${i ? "border-t border-border-soft" : ""}`}>
              {/* Título previsto */}
              <div className="flex items-center gap-3 min-w-0">
                <span className="inline-flex items-center justify-center w-[34px] h-[34px] rounded-md bg-surface-2 shrink-0">
                  <Icon name="receipt" size={16} color="var(--color-text-secondary)" />
                </span>
                <div className="min-w-0">
                  <div className="text-[15px] font-medium text-ink truncate">{m.pendDesc}</div>
                  <div className="text-caption text-faint">previsto · vence {fmtDia(m.dueDate)}</div>
                </div>
              </div>
              {/* Transação no banco */}
              <div className="flex items-center gap-3 min-w-0">
                <span className="inline-flex items-center justify-center w-[34px] h-[34px] rounded-md bg-surface-2 shrink-0">
                  <Icon name="building" size={16} color="var(--color-text-secondary)" />
                </span>
                <div className="min-w-0">
                  <div className="text-[15px] text-ink truncate">{m.ofDesc}</div>
                  <div className="text-caption text-faint">{m.tipo === "entrada" ? "recebido" : "pago"} {fmtDia(m.ofData)}</div>
                </div>
              </div>
              <StatusBadge tone={confTone(m.confianca)}>{confLabel(m.confianca)} · {m.confianca}%</StatusBadge>
              <span className={`tabular-nums shrink-0 md:w-[110px] md:text-right ${m.tipo === "saida" ? "text-negative" : "text-ink"}`}>
                {m.tipo === "saida" ? "−" : ""}<BRL value={m.amount} />
              </span>
              <span className="md:text-right">
                <Button size="sm" variant="secondary" disabled={busy === m.ofId} onClick={() => aplicar(m)} leftIcon={<Icon name="check" size={14} />}>
                  {busy === m.ofId ? "…" : "Conciliar"}
                </Button>
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

function Resumo({ label, valor, contagem, tone = "var(--color-ink)" }: { label: string; valor: number; contagem?: boolean; tone?: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-caption text-faint">{label}</span>
      <span className="text-[18px] font-semibold tabular-nums" style={{ color: tone }}>
        {contagem ? valor.toLocaleString("pt-BR") : <BRL value={valor} />}
      </span>
    </Card>
  );
}
