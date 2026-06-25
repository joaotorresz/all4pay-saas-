"use client";

import * as React from "react";
import { Icon } from "@/components/ui";
import { DemoBadge } from "./DemoBadge";
import { NovoDeposito } from "./NovoDeposito";
import { PeriodFilter } from "./PeriodFilter";

/**
 * Header actions for Início.
 * Filtro de período (Essa semana · Mês atual · Personalizado) · Personalizar
 * Home (liga/desliga e reordena os blocos) · "Novo lançamento". Badge em demo.
 */
export function InicioActions({ demo }: { demo: boolean }) {
  return (
    <>
      {demo && <DemoBadge />}
      <PeriodFilter />
      <button
        onClick={() => window.dispatchEvent(new Event("a4p:open-personalizar"))}
        title="Personalizar Home — ligar/desligar e reordenar blocos"
        aria-label="Personalizar Home"
        className="inline-flex items-center justify-center w-[34px] h-[34px] rounded-md border border-border bg-white text-muted hover:text-ink"
      >
        <Icon name="settings" size={16} color="var(--color-text-secondary)" />
      </button>
      <NovoDeposito />
    </>
  );
}
