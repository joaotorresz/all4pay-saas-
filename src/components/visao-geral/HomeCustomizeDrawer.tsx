"use client";

import * as React from "react";
import { Icon, Switch, Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { COCKPIT_CATALOG } from "./cockpit";

/** Blocos da Home (command center). A ordem aqui é a ordem dos blocos na tela. */
export const BLOCK_ORDER = [
  "Operação", "Resumo executivo", "Saúde financeira", "Caixa", "Receita",
  "Despesas", "Cobrança", "Inteligência", "Radares all4pay",
] as const;
type Bloco = (typeof BLOCK_ORDER)[number];

interface WidgetDef { id: string; label: string; grupo: Bloco; def?: boolean }

/** Curados (ligados por padrão) + catálogo modular (desligados por padrão). */
const CURADOS: WidgetDef[] = [
  { id: "hoje", label: "Hoje · briefing", grupo: "Operação", def: true },
  { id: "saude", label: "Saúde financeira (KPIs)", grupo: "Saúde financeira", def: true },
  // Caixa lidera a Home: fluxo de caixa + velas primeiro, depois o calendário.
  { id: "cashflow", label: "Fluxo de caixa", grupo: "Caixa", def: true },
  { id: "cashCandle", label: "Velas do caixa", grupo: "Caixa", def: true },
  { id: "calendar", label: "Calendário de transações", grupo: "Caixa", def: true },
  { id: "accounts", label: "Saldo · contas", grupo: "Operação", def: true },
  { id: "receivables", label: "A receber", grupo: "Operação", def: true },
  { id: "payables", label: "A pagar", grupo: "Operação", def: true },
  { id: "pendencias", label: "Pendências", grupo: "Operação", def: true },
  { id: "sales", label: "Faturamento", grupo: "Receita", def: true },
  { id: "topClientes", label: "Top clientes", grupo: "Receita", def: true },
  { id: "maioresCategorias", label: "Maiores despesas", grupo: "Despesas", def: true },
  { id: "ultimosGastos", label: "Últimos gastos", grupo: "Despesas", def: true },
  { id: "iaInsights", label: "IA · insights", grupo: "Inteligência", def: true },
  { id: "anomalias", label: "Anomalias", grupo: "Inteligência", def: true },
];

/** Cards disponíveis = curados + catálogo (cockpit modular, default-off). */
export const HOME_WIDGETS: WidgetDef[] = [
  ...CURADOS,
  ...COCKPIT_CATALOG.map((w) => ({ id: w.id, label: w.label, grupo: w.categoria as Bloco, def: false })),
];
export const HOME_WIDGET_IDS = HOME_WIDGETS.map((w) => w.id);
/** Ids ligados por padrão (os demais entram só quando o usuário liga). */
export const DEFAULT_WIDGET_IDS = new Set(HOME_WIDGETS.filter((w) => w.def).map((w) => w.id));
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
  auto,
  setor,
  onToggle,
  onReorder,
  onAuto,
  onReset,
  onClose,
}: {
  open: boolean;
  visiveis: Record<string, boolean>;
  ordem: string[];
  auto: boolean;
  setor: string | null;
  onToggle: (id: string) => void;
  onReorder: (next: string[]) => void;
  onAuto: (v: boolean) => void;
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
              <Icon name="settings" size={14} color="var(--color-on-lime)" />
            </span>
            <span className="text-h3 font-medium text-ink">Personalizar Home</span>
          </div>
          <button onClick={onClose} aria-label="Fechar"><Icon name="x" size={18} color="var(--color-text-secondary)" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          <div className="flex flex-col gap-2 rounded-md border border-border-soft p-3">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span className="flex items-center gap-2">
                <Icon name="sparkles" size={15} color="var(--color-text-secondary)" />
                <span className="text-[17px] font-medium text-ink">Reorganizar por urgência (IA)</span>
              </span>
              <Switch checked={auto} onChange={() => onAuto(!auto)} />
            </label>
            <span className="text-caption text-faint leading-[1.45]">
              {auto
                ? "O bloco mais crítico (caixa em risco, pendências, anomalias) sobe ao topo automaticamente."
                : "Ordem dos blocos fixa pelo seu setor / arraste manual."}
              {setor ? ` Painel base para o setor ${setor}.` : ""}
            </span>
          </div>
          <p className="m-0 text-caption text-muted leading-[1.5]">
            Ligue/desligue os blocos e <b className="text-ink font-medium">arraste pela alça</b> para reordenar
            dentro de cada bloco. Suas preferências ficam salvas neste dispositivo.
          </p>
          {BLOCK_ORDER.map((g) => (
            <div key={g} className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-faint tracking-wide mb-1">{g}</span>
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
                  <span className="text-[17px] text-ink flex-1">{LABEL_DE.get(id)}</span>
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
