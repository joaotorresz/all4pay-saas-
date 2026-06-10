"use client";

import * as React from "react";
import { Icon, Switch, Button } from "@/components/ui";

/** Widgets disponíveis na Home (Fase 1: os 5 blocos atuais). */
export const HOME_WIDGETS: { id: string; label: string; grupo: string }[] = [
  { id: "receivables", label: "A receber", grupo: "Operação" },
  { id: "payables", label: "A pagar", grupo: "Operação" },
  { id: "accounts", label: "Saldo · contas", grupo: "Favoritos" },
  { id: "cashflow", label: "Fluxo de caixa", grupo: "Favoritos" },
  { id: "sales", label: "Faturamento", grupo: "Receita" },
];
export const HOME_WIDGET_IDS = HOME_WIDGETS.map((w) => w.id);

/**
 * Drawer "Personalizar Home" — escolhe quais blocos aparecem (persistido).
 * Fase 1: visibilidade. Reordenar por arrastar entra na próxima fase.
 */
export function HomeCustomizeDrawer({
  open,
  visiveis,
  onToggle,
  onReset,
  onClose,
}: {
  open: boolean;
  visiveis: Record<string, boolean>;
  onToggle: (id: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  const grupos = Array.from(new Set(HOME_WIDGETS.map((w) => w.grupo)));
  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/20" onClick={onClose}>
      <div
        className="w-full max-w-[360px] h-full bg-white shadow-popover border-l border-border flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
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
            Escolha os blocos que aparecem no seu painel. Suas preferências ficam salvas neste dispositivo.
          </p>
          {grupos.map((g) => (
            <div key={g} className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-faint uppercase tracking-wide mb-1">{g}</span>
              {HOME_WIDGETS.filter((w) => w.grupo === g).map((w) => (
                <label key={w.id} className="flex items-center justify-between gap-3 py-2 cursor-pointer">
                  <span className="text-[14px] text-ink">{w.label}</span>
                  <Switch checked={visiveis[w.id] !== false} onChange={() => onToggle(w.id)} />
                </label>
              ))}
            </div>
          ))}
          <p className="m-0 text-caption text-faint leading-[1.5]">
            Mais cards (Runway, Burn, Top clientes, Últimos gastos, IA Insights…), reordenar por arrastar e a Home contextual por perfil chegam nas próximas versões.
          </p>
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-border-soft">
          <Button variant="ghost" size="sm" onClick={onReset}>Restaurar tudo</Button>
          <Button variant="primary" size="sm" onClick={onClose}>Concluir</Button>
        </div>
      </div>
    </div>
  );
}
