"use client";

import * as React from "react";
import { DemoBadge } from "./DemoBadge";
import { NovoDeposito } from "./NovoDeposito";
import { MonthSelector } from "./MonthSelector";

/**
 * Header actions for Início.
 * Seletor de mês global (navega toda a Home por mês) · "Novo lançamento".
 * Demonstração badge em modo demo.
 */
export function InicioActions({ demo }: { demo: boolean }) {
  return (
    <>
      {demo && <DemoBadge />}
      <MonthSelector />
      <NovoDeposito />
    </>
  );
}
