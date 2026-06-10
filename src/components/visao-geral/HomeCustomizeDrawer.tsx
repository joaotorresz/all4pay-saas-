"use client";

import * as React from "react";
import { Icon, Switch, Button } from "@/components/ui";
import { cn } from "@/lib/utils";

/** Blocos da Home (command center). A ordem aqui é a ordem dos blocos na tela. */
export const BLOCK_ORDER = ["Saúde financeira", "Operação", "Receita", "Despesas", "Inteligência"] as const;

/** Cards disponíveis, com o bloco a que pertencem. */
export const HOME_WIDGETS: { id: string; label: string; grupo: (typeof BLOCK_ORDER)[number] }[] = [
  { id: "saude", label: "Saúde financeira (KPIs)", grupo: "Saúde financeira" },
  { id: "cashflow", label: "Fluxo de caixa", grupo: "Saúde financeira" },
  { id: "accounts", label: "Saldo · contas", grupo: "Operação" },
  { id: "receivables", label: "A receber", grupo: "Operação" },
  { id: "payables", label: "A pagar", grupo: "Operação" },
  { id: "pendencias", label: "Pendências", grupo: "Operação" },
  { id: "sales", label: "Faturamento", grupo: "Receita" },
  { id: "topClientes", label: "Top clientes", grupo: "Receita" },
  { id: "maioresCategorias", label: "Maiores despesas", grupo: "Despesas" },
  { id: "ultimosGastos", label: "Últimos gastos", grupo: "Despesas" },
  { id: "iaInsights", label: "IA · insights", grupo: "Inteligência" },
  { id: "anomalias", label: "Anomalias", grupo: "Inteligência" },
];
export const HOME_WIDGET_IDS = HOME_WIDGETS.map((w) => w.id);
const GRUPO_DE = new Map(HOME_WIDGETS.map((w) => [w.id, w.grupo]));
const LABEL_DE = new Map(HOME_WIDGETS.map((w) => [w.id, w.label]));

/** Reordena `ordem` movendo `dragId` para imediatamente antes de `overId`. */
export function reordenar(ordem: string[], dragId: string, overId: string): string[] {
  if (dragId === overId) return ordem;
  const out = ordem.filter((x) => x !== dragId);
  const i = out.indexOf(overId);
  out.splice(i < 0 ? out.length : i, 0, dragId);
  return out;
}

/**
 * Drawer "Personalizar Home" — liga/desliga blocos e reordena por arrastar
 * (dentro de cada bloco). Visibilidade + ordem persistidas pelo OverviewGrid.
 */
export function HomeCustomizeDrawer({
  open,
  visiveis,
  ordem,
  onToggle,
  onReorder,
  onReset,
  onClose,
}: {
  open: boolean;
  visiveis: Record<string, boolean>;
  ordem: string[];
  onToggle: (id: string) => void;
  onReorder: (next: string[]) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [drag, setDrag] = React.useState<string | null>(null);
  const [over, setOver] = React.useState<string | null>(null);
  if (!open) return null;

  const idsDoGrupo = (g: string) =>
    ordem.filter((id) => GRUPO_DE.get(id) === g);

  const drop = (overId: string) => {
    if (drag && GRUPO_DE.get(drag) === GRUPO_DE.get(overId)) onReorder(reordenar(ordem, drag, overId));
    setDrag(null);
    setOver(null);
  };

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/20" onClick={onClose}>
      <div className="w-full max-w-[360px] h-full bg-white shadow-popover border-l border-border flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-soft">
          <div className="flex items-center gap-2">
            <span className="w-[26px] h-[26px] rounded-sm bg-lime inline-flex items-center justify-center">
              <Icon name="settings" size={14} color="var(--color-ink)" />
            </span>
            <span className="text-h3 font-medium text-ink">Personalizar Home</span>
          </div>
          <button onClick={onClose} aria-label="Fechar"><Icon name="x" size={18} color="var(--color-text-secondary)" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          <p className="m-0 text-caption text-muted leading-[1.5]">
            Ligue/desligue os blocos e <b className="text-ink font-medium">arraste pela alça</b> para reordenar
            dentro de cada bloco. Suas preferências ficam salvas neste dispositivo.
          </p>
          {BLOCK_ORDER.map((g) => (
            <div key={g} className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-faint uppercase tracking-wide mb-1">{g}</span>
              {idsDoGrupo(g).map((id) => (
                <div
                  key={id}
                  draggable
                  onDragStart={() => setDrag(id)}
                  onDragEnd={() => { setDrag(null); setOver(null); }}
                  onDragOver={(e) => { e.preventDefault(); if (over !== id) setOver(id); }}
                  onDrop={() => drop(id)}
                  className={cn(
                    "flex items-center gap-2 py-2 px-1 rounded-sm",
                    drag === id && "opacity-40",
                    over === id && drag && GRUPO_DE.get(drag) === g && drag !== id && "bg-surface-2",
                  )}
                >
                  <span className="cursor-grab active:cursor-grabbing text-faint" aria-hidden>
                    <Icon name="grip-vertical" size={15} color="var(--color-text-tertiary)" />
                  </span>
                  <span className="text-[14px] text-ink flex-1">{LABEL_DE.get(id)}</span>
                  <Switch checked={visiveis[id] !== false} onChange={() => onToggle(id)} />
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-border-soft">
          <Button variant="ghost" size="sm" onClick={onReset}>Restaurar padrão</Button>
          <Button variant="primary" size="sm" onClick={onClose}>Concluir</Button>
        </div>
      </div>
    </div>
  );
}
