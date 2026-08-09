"use client";

import * as React from "react";
import { Card, Money, StatusBadge, Avatar, Skeleton, Button, Icon } from "@/components/ui";
import { brlParts } from "@/lib/format";
import { isoDay } from "@/lib/aggregations";
import type { Movement } from "@/lib/types";
import { DEMO_ACCOUNTS } from "@/lib/demo/seed";
import { cancelMovement } from "@/lib/data";
import { useAccountsList } from "@/components/lancamentos/hooks";
import { isPeriodLocked } from "@/lib/close";
import { useToast } from "@/components/listas/ListChrome";
import { EditMovementModal } from "./EditMovementModal";
import { EmptyState } from "./shared";

const encurtaId = (id: string) => (id?.length > 10 ? `Conta ${id.slice(0, 4)}` : id);

function dueStatus(due: string): { tone: "warning" | "neutral" | "positive"; label: string } {
  const today = isoDay(new Date());
  if (due < today) return { tone: "warning", label: "Vencido" };
  if (due === today) return { tone: "positive", label: "Vence hoje" };
  return { tone: "neutral", label: "A vencer" };
}

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
};

function Checkbox({ on }: { on: boolean }) {
  return (
    <span className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-sm border shrink-0" style={{ borderColor: on ? "var(--color-ink)" : "var(--color-border)", background: on ? "var(--color-ink)" : "transparent" }}>
      {on && <Icon name="check" size={12} color="var(--color-white)" />}
    </span>
  );
}

export function MovementsTable({
  movements,
  isLoading,
  isError,
  emptyTitle,
  emptyHint,
  variant = "open",
  editable = false,
  onChanged,
}: {
  movements?: Movement[];
  isLoading: boolean;
  isError: boolean;
  emptyTitle: string;
  emptyHint?: string;
  variant?: "open" | "reconcile" | "paid";
  /** Mostra o "Editar" no topo (modo seleção em lote) + Editar por linha. */
  editable?: boolean;
  /** Chamado após editar/cancelar/excluir em lote — o chamador invalida a lista. */
  onChanged?: () => void;
}) {
  const { show, node } = useToast();
  const { data: accounts } = useAccountsList();
  const nomeConta = React.useCallback(
    (id: string) =>
      accounts?.find((a) => a.id === id)?.name ?? DEMO_ACCOUNTS.find((a) => a.id === id)?.name ?? encurtaId(id),
    [accounts],
  );
  const [editing, setEditing] = React.useState<Movement | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [selMode, setSelMode] = React.useState(false);
  const [sel, setSel] = React.useState<Set<string>>(new Set());

  const lista = movements ?? [];
  const allSelected = lista.length > 0 && lista.every((m) => sel.has(m.id));
  const toggleRow = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSel(allSelected ? new Set() : new Set(lista.map((m) => m.id)));
  const sairSelecao = () => { setSelMode(false); setSel(new Set()); };

  const cancelar = async (m: Movement) => {
    if (isPeriodLocked(m.due_date)) { show("Período fechado — destrave em Fechamento para editar."); return; }
    if (!window.confirm(`Excluir "${m.description ?? "lançamento"}"? Vai para a Lixeira (pode ser restaurado).`)) return;
    setBusy(m.id);
    try { await cancelMovement(m.id); show("Enviado para a Lixeira"); onChanged?.(); }
    catch { show("Não foi possível excluir"); }
    finally { setBusy(null); }
  };

  const excluirLote = async () => {
    if (!sel.size) return;
    if (!window.confirm(`Excluir ${sel.size} lançamento(s)? Vão para a Lixeira (podem ser restaurados).`)) return;
    setBusy("lote");
    try {
      const lockedSet = new Set(lista.filter((m) => isPeriodLocked(m.due_date)).map((m) => m.id));
      const alvos = Array.from(sel).filter((id) => !lockedSet.has(id));
      for (const id of alvos) await cancelMovement(id);
      const pulados = sel.size - alvos.length;
      show(pulados > 0 ? `${alvos.length} enviado(s); ${pulados} em período travado` : `${alvos.length} enviado(s) para a Lixeira`);
      sairSelecao();
      onChanged?.();
    } catch {
      show("Falha ao excluir em lote");
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) {
    return (
      <Card padded={false}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={`flex items-center gap-3 px-5 py-3 ${i ? "border-t border-border-soft" : ""}`}>
            <Skeleton className="w-8 h-8" rounded="pill" />
            <div className="flex-1 flex flex-col gap-[6px]">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-[10px] w-24" />
            </div>
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </Card>
    );
  }

  if (isError) return <Card><EmptyState title="Não foi possível carregar a lista" /></Card>;
  if (lista.length === 0) return <Card><EmptyState icon="file-text" title={emptyTitle} hint={emptyHint} /></Card>;

  return (
    <div className="flex flex-col gap-3">
      {/* Barra de ações acima da tabela */}
      {editable && (
        <div className="flex items-center gap-2 flex-wrap">
          {selMode ? (
            <>
              <button onClick={toggleAll} className="text-caption font-medium text-ink px-2 py-1 rounded-sm hover:bg-surface-2 inline-flex items-center gap-2">
                <Checkbox on={allSelected} />{allSelected ? "Limpar seleção" : "Selecionar tudo"}
              </button>
              <span className="text-caption text-faint">{sel.size} selecionado(s)</span>
              <div className="ml-auto flex items-center gap-2">
                <Button size="sm" variant="secondary" disabled={!sel.size || busy === "lote"} onClick={excluirLote} leftIcon={<Icon name="x" size={14} color="var(--color-negative)" />}>
                  {busy === "lote" ? "Excluindo…" : `Excluir selecionados${sel.size ? ` (${sel.size})` : ""}`}
                </Button>
                <Button size="sm" variant="ghost" onClick={sairSelecao}>Concluir</Button>
              </div>
            </>
          ) : (
            <Button size="sm" variant="secondary" className="ml-auto" onClick={() => setSelMode(true)} leftIcon={<Icon name="list-checks" size={14} />}>
              Editar
            </Button>
          )}
        </div>
      )}

      <Card padded={false}>
        <div className="hidden sm:flex items-center gap-3 px-5 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-faint border-b border-border-soft">
          {selMode && <span className="w-[18px]" />}
          <span className="flex-1">Descrição</span>
          <span className="w-[110px]">{variant === "paid" ? "Liquidação" : "Vencimento"}</span>
          <span className="w-[120px]">Status</span>
          <span className="w-[140px] text-right">Valor</span>
          {editable && <span className="w-[150px]" />}
        </div>
        {lista.map((m, i) => {
          const parts = brlParts(m.amount);
          const isOut = m.type === "saida";
          const status = variant === "reconcile"
            ? { tone: "warning" as const, label: "Não conciliado" }
            : variant === "paid"
            ? { tone: "positive" as const, label: isOut ? "Pago" : "Recebido" }
            : dueStatus(m.due_date);
          const dateShown = variant === "paid" ? (m.paid_date ?? m.due_date) : m.due_date;
          const on = sel.has(m.id);
          return (
            <div
              key={m.id}
              onClick={selMode ? () => toggleRow(m.id) : undefined}
              className={`flex items-center gap-3 px-3 sm:px-5 py-3 ${i ? "border-t border-border-soft" : ""} ${selMode ? "cursor-pointer hover:bg-surface-1" : ""} ${on ? "bg-surface-1" : ""}`}
            >
              {selMode && <Checkbox on={on} />}
              <Avatar name={m.description ?? "—"} size={32} />
              <div className="flex-1 min-w-0">
                <div className="text-[16px] sm:text-[17px] font-medium text-ink truncate">{m.description ?? "Movimentação"}</div>
                <div className="text-caption text-faint tabular-nums truncate">{nomeConta(m.account_id)}</div>
                {/* Telas pequenas: data + status sob a descrição (colunas escondidas) */}
                <div className="sm:hidden text-caption text-faint tabular-nums mt-[2px]">
                  {fmtDate(dateShown)} · {status.label}
                </div>
              </div>
              <span className="hidden sm:block w-[110px] text-[16px] text-ink tabular-nums">{fmtDate(dateShown)}</span>
              <span className="hidden sm:block w-[120px]"><StatusBadge tone={status.tone}>{status.label}</StatusBadge></span>
              <span className="w-[100px] sm:w-[140px] flex justify-end shrink-0">
                <Money integer={parts.integer} decimals={parts.decimals} size="sm" color={isOut ? "var(--color-negative)" : "var(--color-ink)"} />
              </span>
              {editable && (
                <span className="w-auto sm:w-[150px] flex justify-end gap-1 shrink-0">
                  {!selMode && (
                    isPeriodLocked(m.due_date) ? (
                      <span className="text-caption text-faint inline-flex items-center gap-1 px-2 py-1" title="Período fechado (travado)">
                        <Icon name="shield-check" size={13} color="var(--color-text-tertiary)" />Travado
                      </span>
                    ) : (
                      <>
                        <button onClick={() => setEditing(m)} className="text-caption text-muted hover:text-ink px-2 py-1 rounded-sm hover:bg-surface-2">Editar</button>
                        <button onClick={() => cancelar(m)} disabled={busy === m.id} className="text-caption text-negative px-2 py-1 rounded-sm hover:bg-surface-2 disabled:opacity-45">{busy === m.id ? "…" : "Excluir"}</button>
                      </>
                    )
                  )}
                </span>
              )}
            </div>
          );
        })}
      </Card>

      {editing && (
        <EditMovementModal
          movement={editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { show(msg); onChanged?.(); }}
        />
      )}
      {node}
    </div>
  );
}
