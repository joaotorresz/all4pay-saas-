"use client";

import * as React from "react";
import { Select } from "@/components/ui";
import { useFluxoFiltros, PERIODOS, type Regime, type Visao } from "./FiltrosContext";
import type { FinancialAccount } from "@/lib/types";

const REGIMES: { id: Regime; label: string }[] = [
  { id: "competencia", label: "Competência" },
  { id: "caixa", label: "Caixa" },
  { id: "hibrido", label: "Híbrido" },
];
const VISOES: { id: Visao; label: string }[] = [
  { id: "previsto", label: "Previsto" },
  { id: "realizado", label: "Realizado" },
  { id: "consolidado", label: "Consolidado" },
];

/** Header do Fluxo de Caixa — período, empresa, conta, regime e visão.
 *  Toda alteração reprocessa a página inteira (via FiltrosContext). */
export function Header({ contas }: { contas: FinancialAccount[] }) {
  const { filtros, set } = useFluxoFiltros();

  return (
    <div className="flex flex-col gap-3">
      {/* Período em pills */}
      <div className="flex flex-wrap items-center gap-1">
        {PERIODOS.map((p) => {
          const on = filtros.periodo === p.id;
          return (
            <button
              key={p.id}
              onClick={() => set({ periodo: p.id })}
              className={`rounded-pill px-3 py-[6px] text-caption transition-colors ${on ? "bg-ink text-white font-medium" : "bg-surface-2 text-muted hover:text-ink"}`}
            >
              {p.label}
            </button>
          );
        })}
        {filtros.periodo === "custom" && (
          <span className="inline-flex items-center gap-1 ml-1">
            <input
              type="number" min={1} max={730} value={filtros.diasCustom}
              onChange={(e) => set({ diasCustom: Math.max(1, Number(e.target.value) || 1) })}
              className="w-[64px] rounded-md border border-border bg-white px-2 py-[5px] text-caption text-ink tabular-nums outline-none focus:border-faint"
            />
            <span className="text-caption text-faint">dias</span>
          </span>
        )}
      </div>

      {/* Empresa · Conta · Regime · Visão */}
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="Empresa"
          value={filtros.empresa}
          onChange={(v) => set({ empresa: v })}
          options={[
            { value: "todas", label: "Todas" },
            { value: "au-pay", label: "AU Pay" },
            { value: "userfly", label: "UserFly" },
            { value: "hangar", label: "Hangar" },
            { value: "spe", label: "SPE" },
          ]}
          containerClassName="min-w-[150px]"
        />
        <Select
          label="Conta"
          value={filtros.conta}
          onChange={(v) => set({ conta: v })}
          options={[{ value: "todas", label: "Todas" }, ...contas.map((c) => ({ value: c.id, label: c.name }))]}
          containerClassName="min-w-[180px]"
        />

        <Segmented label="Regime" value={filtros.regime} options={REGIMES} onChange={(v) => set({ regime: v as Regime })} />
        <Segmented label="Visão" value={filtros.visao} options={VISOES} onChange={(v) => set({ visao: v as Visao })} />
      </div>
    </div>
  );
}

function Segmented({ label, value, options, onChange }: {
  label: string; value: string; options: { id: string; label: string }[]; onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-[6px]">
      <span className="text-label font-medium text-muted">{label}</span>
      <div className="inline-flex rounded-md bg-surface-2 p-[3px]">
        {options.map((o) => {
          const on = value === o.id;
          return (
            <button
              key={o.id}
              onClick={() => onChange(o.id)}
              className={`rounded-[7px] px-3 py-[6px] text-caption transition-colors ${on ? "bg-white text-ink font-medium shadow-pill" : "text-muted hover:text-ink"}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
