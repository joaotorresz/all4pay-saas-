"use client";

import * as React from "react";
import { DemoBadge } from "./DemoBadge";
import { PeriodFilter } from "./PeriodFilter";

/**
 * Header actions for Início.
 * Filtro de período (Essa semana · o mês selecionado). Badge em demo.
 * "Personalizar Home" vive na command palette (⌘K → "Personalizar Home") e o
 * "Novo lançamento" saiu do header — os lançamentos seguem pelo menu, pelo
 * painel de Vendas e pelos atalhos Alt+letra.
 */
export function InicioActions({ demo }: { demo: boolean }) {
  return (
    <>
      {demo && <DemoBadge />}
      <PeriodFilter />
    </>
  );
}
