"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Icon, Money, Avatar, Skeleton, InfoHint } from "@/components/ui";
import { brlParts } from "@/lib/format";
import { useToast } from "@/components/listas/ListChrome";
import { getTrashedMovements, restoreMovement, purgeMovement } from "@/lib/data";
import type { Movement, MovementType } from "@/lib/types";
import { EmptyState } from "@/components/visao-geral/shared";

type Filtro = "todos" | "entrada" | "saida";
const FILTROS: { id: Filtro; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "entrada", label: "Recebimentos" },
  { id: "saida", label: "Pagamentos" },
];
const fmtDia = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y.slice(2)}`; };
const tipoLabel = (t: MovementType) => (t === "entrada" ? "Recebimento" : "Pagamento");

/** Lixeira de lançamentos — pagamentos/recebimentos cancelados, recuperáveis.
 *  Restaurar volta para "A receber/A pagar"; excluir remove de vez. Demo-safe. */
export function LixeiraView({ inicial = "todos" }: { inicial?: Filtro }) {
  const qc = useQueryClient();
  const { show, node } = useToast();
  const [filtro, setFiltro] = React.useState<Filtro>(inicial);
  const [busy, setBusy] = React.useState<string | null>(null);
  const trash = useQuery({ queryKey: ["trashed-movements"], queryFn: getTrashedMovements });

  const itens = (trash.data ?? []).filter((m) => filtro === "todos" || m.type === filtro);

  const restaurar = async (m: Movement) => {
    setBusy(m.id);
    try { await restoreMovement(m.id); show("Lançamento restaurado — voltou para “A " + (m.type === "entrada" ? "receber" : "pagar") + "”."); await qc.invalidateQueries(); }
    catch { show("Não foi possível restaurar"); }
    finally { setBusy(null); }
  };
  const excluir = async (m: Movement) => {
    if (!window.confirm(`Excluir definitivamente "${m.description ?? "lançamento"}"? Esta ação não tem volta.`)) return;
    setBusy(m.id);
    try { await purgeMovement(m.id); show("Excluído definitivamente"); await qc.invalidateQueries(); }
    catch { show("Não foi possível excluir"); }
    finally { setBusy(null); }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Icon name="inbox" size={16} color="var(--color-text-secondary)" />
          <span className="text-label font-medium text-muted">Lançamentos cancelados — restaure para “A receber/A pagar” ou exclua de vez</span>
          <InfoHint
            align="left"
            titulo="Lixeira"
            oQue="Guarda os lançamentos que você cancelou; dá para restaurá-los ou apagá-los de vez."
            comoCalcula="Reúne os pagamentos e recebimentos marcados como cancelados; restaurar volta o lançamento para A receber ou A pagar."
          />
        </div>
        <div className="inline-flex rounded-md bg-surface-2 p-[3px]">
          {FILTROS.map((f) => (
            <button key={f.id} onClick={() => setFiltro(f.id)} className={`rounded-[7px] px-3 py-[6px] text-caption ${filtro === f.id ? "bg-white text-ink font-medium shadow-pill" : "text-muted hover:text-ink"}`}>{f.label}</button>
          ))}
        </div>
      </Card>

      {trash.isLoading ? (
        <Skeleton className="h-[200px] w-full" rounded="md" />
      ) : trash.isError ? (
        <Card><EmptyState title="Não foi possível carregar a lixeira" /></Card>
      ) : itens.length === 0 ? (
        <Card><EmptyState icon="inbox" title="Lixeira vazia" hint="Lançamentos que você cancelar em “A receber/A pagar” aparecem aqui e podem ser restaurados." /></Card>
      ) : (
        <Card padded={false}>
          <div className="flex items-center gap-3 px-5 py-2 text-[11px] font-medium tracking-[0.08em] text-faint border-b border-border-soft">
            <span className="flex-1">Descrição</span>
            <span className="w-[110px]">Tipo</span>
            <span className="w-[100px]">Vencimento</span>
            <span className="w-[120px] text-right">Valor</span>
            <span className="w-[170px]" />
          </div>
          {itens.map((m, i) => {
            const parts = brlParts(m.amount);
            const isOut = m.type === "saida";
            return (
              <div key={m.id} className={`flex items-center gap-3 px-5 py-3 ${i ? "border-t border-border-soft" : ""}`}>
                <Avatar name={m.description ?? "—"} size={32} />
                <div className="flex-1 min-w-0">
                  <div className="text-[17px] font-medium text-ink truncate">{m.description ?? "Lançamento"}</div>
                  <div className="text-caption text-faint truncate">{m.category ?? "—"}</div>
                </div>
                <span className="w-[110px] text-caption text-muted">{tipoLabel(m.type)}</span>
                <span className="w-[100px] text-[15px] text-ink tabular-nums">{fmtDia(m.due_date)}</span>
                <span className="w-[120px] flex justify-end">
                  <Money integer={parts.integer} decimals={parts.decimals} size="sm" color={isOut ? "var(--color-negative)" : "var(--color-ink)"} />
                </span>
                <span className="w-[170px] flex justify-end gap-1">
                  <button onClick={() => restaurar(m)} disabled={busy === m.id} className="text-caption font-medium text-on-lime bg-lime rounded-pill px-3 py-[4px] disabled:opacity-45">
                    {busy === m.id ? "…" : "Restaurar"}
                  </button>
                  <button onClick={() => excluir(m)} disabled={busy === m.id} className="text-caption text-negative px-2 py-1 rounded-sm hover:bg-surface-2 disabled:opacity-45">Excluir</button>
                </span>
              </div>
            );
          })}
        </Card>
      )}
      {node}
    </div>
  );
}
