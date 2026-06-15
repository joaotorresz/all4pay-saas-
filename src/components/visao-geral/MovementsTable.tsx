"use client";

import * as React from "react";
import { Card, Money, StatusBadge, Avatar, Skeleton } from "@/components/ui";
import { brlParts } from "@/lib/format";
import { isoDay } from "@/lib/aggregations";
import type { Movement } from "@/lib/types";
import { DEMO_ACCOUNTS } from "@/lib/demo/seed";
import { cancelMovement } from "@/lib/data";
import { useToast } from "@/components/listas/ListChrome";
import { EditMovementModal } from "./EditMovementModal";
import { EmptyState } from "./shared";

const accountName = (id: string) =>
  DEMO_ACCOUNTS.find((a) => a.id === id)?.name ?? id;

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
  variant?: "open" | "reconcile";
  /** Mostra ações Editar/Cancelar em cada linha (lançamento ainda em aberto). */
  editable?: boolean;
  /** Chamado após editar/cancelar — o chamador invalida a lista. */
  onChanged?: () => void;
}) {
  const { show, node } = useToast();
  const [editing, setEditing] = React.useState<Movement | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const cancelar = async (m: Movement) => {
    if (!window.confirm(`Cancelar "${m.description ?? "lançamento"}"? Ele sai da lista de aberto (não vira pago).`)) return;
    setBusy(m.id);
    try {
      await cancelMovement(m.id);
      show("Lançamento cancelado");
      onChanged?.();
    } catch {
      show("Não foi possível cancelar");
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) {
    return (
      <Card padded={false}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`flex items-center gap-3 px-5 py-3 ${i ? "border-t border-border-soft" : ""}`}
          >
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

  if (isError) {
    return (
      <Card>
        <EmptyState title="Não foi possível carregar a lista" />
      </Card>
    );
  }

  if (!movements || movements.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="file-text"
          title={emptyTitle}
          hint={emptyHint}
        />
      </Card>
    );
  }

  return (
    <Card padded={false}>
      <div className="flex items-center gap-3 px-5 py-2 text-caption font-medium text-muted border-b border-border-soft">
        <span className="flex-1">Descrição</span>
        <span className="w-[110px]">Vencimento</span>
        <span className="w-[120px]">Status</span>
        <span className="w-[140px] text-right">Valor</span>
        {editable && <span className="w-[150px]" />}
      </div>
      {movements.map((m, i) => {
        const parts = brlParts(m.amount);
        const status =
          variant === "reconcile"
            ? { tone: "warning" as const, label: "Não conciliado" }
            : dueStatus(m.due_date);
        const isOut = m.type === "saida";
        return (
          <div
            key={m.id}
            className={`flex items-center gap-3 px-5 py-3 ${i ? "border-t border-border-soft" : ""}`}
          >
            <Avatar name={m.description ?? "—"} size={32} />
            <div className="flex-1 min-w-0">
              <div className="text-[17px] font-medium text-ink truncate">
                {m.description ?? "Movimentação"}
              </div>
              <div className="text-caption text-faint tabular-nums">
                {accountName(m.account_id)}
              </div>
            </div>
            <span className="w-[110px] text-[16px] text-ink tabular-nums">
              {fmtDate(m.due_date)}
            </span>
            <span className="w-[120px]">
              <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            </span>
            <span className="w-[140px] flex justify-end">
              <Money
                integer={parts.integer}
                decimals={parts.decimals}
                size="sm"
                color={isOut ? "var(--color-negative)" : "var(--color-ink)"}
              />
            </span>
            {editable && (
              <span className="w-[150px] flex justify-end gap-1">
                <button
                  onClick={() => setEditing(m)}
                  className="text-caption text-muted hover:text-ink px-2 py-1 rounded-sm hover:bg-surface-2"
                >
                  Editar
                </button>
                <button
                  onClick={() => cancelar(m)}
                  disabled={busy === m.id}
                  className="text-caption text-negative px-2 py-1 rounded-sm hover:bg-surface-2 disabled:opacity-45"
                >
                  {busy === m.id ? "…" : "Cancelar"}
                </button>
              </span>
            )}
          </div>
        );
      })}
      {editing && (
        <EditMovementModal
          movement={editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { show(msg); onChanged?.(); }}
        />
      )}
      {node}
    </Card>
  );
}
