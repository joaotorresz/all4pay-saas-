"use client";

import * as React from "react";
import { DemoBadge } from "./DemoBadge";
import { NovoDeposito } from "./NovoDeposito";
import { PeriodFilter } from "./PeriodFilter";

/**
 * Header actions for Início.
 * Filtro de período (Essa semana · o mês selecionado) · "Novo lançamento".
 * Badge em demo. "Personalizar Home" saiu daqui e vive na command palette
 * (⌘K → "Personalizar Home") — o drawer continua o mesmo.
 */
export function InicioActions({ demo }: { demo: boolean }) {
  return (
    <>
      {demo && <DemoBadge />}
      <PeriodFilter />
      <NovoDeposito />
    </>
  );
}
