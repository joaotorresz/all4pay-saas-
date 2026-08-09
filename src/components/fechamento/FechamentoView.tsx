"use client";

/**
 * Fechamento contábil contínuo — checklist do mês com tarefas de IA já
 * resolvidas (lançamentos faltantes, pendências, provisões) + tarefas manuais
 * (conciliar, revisar variância, aprovar) + travar período (locked period).
 * Inspirado no close do Campfire. Demo-safe; reusa o RiskInput.
 */
import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card, BRL, StatusBadge, Button, Icon, Skeleton, InfoHint } from "@/components/ui";
import { getRiscoInput } from "@/lib/data";
import { montarFechamento, mesLabel } from "@/core/close";
import { isPeriodLocked, lockPeriod, unlockPeriod, loadCloseTasks, saveCloseTask, hydrateClose } from "@/lib/close";
import { postarLancamento, travarPeriodoLive } from "@/lib/ledger";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { AppShell } from "@/components/app/AppShell";

const statusTone = (s: "ok" | "pendente" | "atencao") => (s === "ok" ? "positive" : s === "atencao" ? "warning" : "neutral");
const statusLabel = (s: "ok" | "pendente" | "atencao") => (s === "ok" ? "OK" : s === "atencao" ? "Atenção" : "Pendente");

/** Lista de meses para o seletor: mês corrente de `hoje` + 5 anteriores. */
function mesesDisponiveis(hoje: string): string[] {
  const [y, m] = hoje.slice(0, 7).split("-").map(Number);
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(y, m - 1 - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

export function FechamentoView() {
  const q = useQuery({ queryKey: ["risco-input"], queryFn: getRiscoInput });
  const [mes, setMes] = React.useState<string | null>(null);
  const [tarefasManuais, setTarefasManuais] = React.useState<Record<string, boolean>>({});
  const [travado, setTravado] = React.useState(false);
  const [tick, setTick] = React.useState(0); // força recomputo ao mudar estado local
  const [hydrated, setHydrated] = React.useState(false);
  const [provMsg, setProvMsg] = React.useState<string | null>(null);

  // Hidrata locks/tarefas do banco (live) → cross-device; demo é no-op.
  React.useEffect(() => { hydrateClose().finally(() => setHydrated(true)); }, []);

  const meses = q.data ? mesesDisponiveis(q.data.hoje) : [];
  const mesAtivo = mes ?? meses[0] ?? null;

  React.useEffect(() => {
    if (!mesAtivo) return;
    setTarefasManuais(loadCloseTasks(mesAtivo));
    setTravado(isPeriodLocked(mesAtivo));
  }, [mesAtivo, hydrated]);

  const report = React.useMemo(() => {
    if (!q.data || !mesAtivo) return undefined;
    void tick;
    return montarFechamento(q.data, mesAtivo, { travado, tarefasManuais });
  }, [q.data, mesAtivo, travado, tarefasManuais, tick]);

  const toggleTarefa = (id: string) => {
    if (!mesAtivo) return;
    const next = !tarefasManuais[id];
    setTarefasManuais((t) => ({ ...t, [id]: next }));
    saveCloseTask(mesAtivo, id, next);
  };
  const travar = () => {
    if (!mesAtivo) return;
    if (travado) { unlockPeriod(mesAtivo); setTravado(false); travarPeriodoLive(mesAtivo, false).catch(() => {}); }
    else {
      if (!window.confirm(`Travar ${mesLabel(mesAtivo)}? Lançamentos desse mês ficam protegidos contra edição/exclusão (e o razão rejeita postagens no banco).`)) return;
      lockPeriod(mesAtivo); setTravado(true); travarPeriodoLive(mesAtivo, true).catch(() => {});
    }
    setTick((x) => x + 1);
  };
  const lancarProvisao = async (categoria: string, valor: number) => {
    if (!mesAtivo || valor <= 0) return;
    try {
      await postarLancamento({
        entryDate: `${mesAtivo}-01`, description: `Provisão: ${categoria}`, source: "system",
        externalKey: `prov:${mesAtivo}:${categoria}`,
        lines: [{ accountId: "4.1.09", debit: valor }, { accountId: "2.1.99", credit: valor }],
      });
      setProvMsg(`Provisão de "${categoria}" lançada no razão.`);
    } catch (e) { setProvMsg(`Falha: ${(e as Error).message}`); }
  };

  return (
    <AppShell title="Fechamento contábil" crumb="Relatórios" actions={isDemo ? <DemoBadge /> : null}>
      {q.isLoading || !report ? (
        <div className="flex flex-col gap-3">
          <Card><Skeleton className="h-16 w-full" /></Card>
          <Card><Skeleton className="h-40 w-full" /></Card>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Seletor de mês */}
          <div className="flex items-center gap-1 flex-wrap">
            {meses.map((m) => (
              <button key={m} onClick={() => setMes(m)}
                className={`text-caption font-medium rounded-pill px-3 py-1 inline-flex items-center gap-1 ${m === mesAtivo ? "bg-surface-3 text-ink font-semibold" : "bg-surface-2 text-muted hover:text-ink"}`}>
                {mesLabel(m)}
                {isPeriodLocked(m) && <Icon name="shield-check" size={12} color={m === mesAtivo ? "var(--color-white)" : "var(--color-text-tertiary)"} />}
              </button>
            ))}
          </div>

          {/* Cabeçalho: prontidão + métricas + travar */}
          <Card className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-label font-medium text-muted inline-flex items-center gap-1">{report.mesLabel}<InfoHint align="left" titulo="Prontidão do fechamento" oQue="Quanto do fechamento contábil do mês já está concluído e se o período pode ser travado." comoCalcula="Percentual de tarefas do checklist concluídas (de IA mais manuais) sobre o total do mês." /></div>
                <div className="text-[28px] leading-none font-semibold text-ink mt-1">{Math.round(report.prontidao * 100)}% pronto</div>
              </div>
              <div className="flex items-center gap-2">
                {report.travado && <StatusBadge tone="positive">Período travado</StatusBadge>}
                <Button size="sm" variant={report.travado ? "secondary" : "primary"} onClick={travar}
                  leftIcon={<Icon name="shield-check" size={14} color={report.travado ? "var(--color-ink)" : "var(--color-on-lime)"} />}>
                  {report.travado ? "Destravar período" : "Travar período"}
                </Button>
              </div>
            </div>
            <div className="h-[6px] rounded-pill bg-surface-2 overflow-hidden">
              <div className="h-full rounded-pill bg-lime" style={{ width: `${Math.round(report.prontidao * 100)}%` }} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
              <Metrica label="Receita" valor={report.metricas.receita} />
              <Metrica label="Despesa" valor={report.metricas.despesa} />
              <Metrica label="Resultado" valor={report.metricas.resultado} />
              <Metrica label="Lançamentos" valor={report.metricas.lancamentos} contagem />
            </div>
          </Card>

          {/* Checklist */}
          <Card padded={false} info={{ titulo: "Checklist de fechamento", oQue: "A lista de tarefas para fechar o mês, com as automáticas (IA) já resolvidas e as manuais para você marcar.", comoCalcula: "Tarefas de IA derivadas do estado do mês (lançamentos faltantes, pendências) mais tarefas manuais fixas; cada uma marca OK, Atenção ou Pendente." }}>
            <div className="px-5 py-3 border-b border-border-soft text-label font-medium text-muted">Checklist de fechamento</div>
            {report.tarefas.map((t, i) => (
              <div key={t.id} className={`flex items-center gap-3 px-3 sm:px-5 py-3 ${i ? "border-t border-border-soft" : ""}`}>
                {t.tipo === "manual" ? (
                  <button onClick={() => toggleTarefa(t.id)} aria-label={t.status === "ok" ? "Desmarcar" : "Marcar"}
                    className="inline-flex items-center justify-center w-[20px] h-[20px] rounded-sm border shrink-0"
                    style={{ borderColor: t.status === "ok" ? "var(--color-ink)" : "var(--color-border)", background: t.status === "ok" ? "var(--color-ink)" : "transparent" }}>
                    {t.status === "ok" && <Icon name="check" size={13} color="var(--color-white)" />}
                  </button>
                ) : (
                  <span className="inline-flex items-center justify-center w-[20px] h-[20px] rounded-sm bg-lime-tint shrink-0" title="Tarefa de IA (automática)">
                    <Icon name="sparkles" size={12} color="var(--color-lime)" />
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[16px] font-medium text-ink truncate">{t.titulo}</div>
                  <div className="text-caption text-faint truncate">{t.detalhe ?? t.descricao}</div>
                </div>
                {t.href && (
                  <Link href={t.href} className="text-caption text-muted hover:text-ink px-2 py-1 rounded-sm hover:bg-surface-2 shrink-0">Abrir</Link>
                )}
                <StatusBadge tone={statusTone(t.status)}>{statusLabel(t.status)}</StatusBadge>
              </div>
            ))}
          </Card>

          {/* Provisões sugeridas (accruals) */}
          {report.sugestoes.length > 0 && (
            <Card className="flex flex-col gap-3" info={{ titulo: "Provisões sugeridas", oQue: "Despesas que provavelmente ocorreram no mês mas ainda não foram lançadas, sugeridas para você provisionar (accrual).", comoCalcula: "A IA estima pela média histórica de cada categoria recorrente; Lançar cria a entrada no razão (despesa contra provisões a pagar)." }}>
              <span className="text-label font-medium text-muted inline-flex items-center gap-2">
                <Icon name="sparkles" size={15} color="var(--color-lime)" /> Provisões sugeridas (accruals)
              </span>
              {report.sugestoes.map((s, i) => (
                <div key={i} className="flex items-center justify-between gap-3 py-2 border-t border-border-soft first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-medium text-ink truncate">{s.categoria}</div>
                    <div className="text-caption text-faint truncate">{s.motivo}</div>
                  </div>
                  <span className="tabular-nums text-ink shrink-0"><BRL value={s.valorSugerido} /></span>
                  <button onClick={() => lancarProvisao(s.categoria, s.valorSugerido)} className="text-caption text-muted hover:text-ink px-2 py-1 rounded-sm hover:bg-surface-2 shrink-0">Lançar</button>
                </div>
              ))}
              {provMsg && <span className="text-caption text-positive">{provMsg}</span>}
              <span className="text-caption text-faint">Provisões são sugestões da IA pela média histórica — “Lançar” cria o lançamento no razão (despesa × provisões a pagar).</span>
            </Card>
          )}
        </div>
      )}
    </AppShell>
  );
}

function Metrica({ label, valor, contagem }: { label: string; valor: number; contagem?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-caption text-faint">{label}</span>
      <span className="text-[18px] font-medium text-ink tabular-nums">
        {contagem ? valor.toLocaleString("pt-BR") : <BRL value={valor} />}
      </span>
    </div>
  );
}
