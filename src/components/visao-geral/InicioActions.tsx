"use client";

import * as React from "react";
import { Button, Icon } from "@/components/ui";
import { DemoBadge } from "./DemoBadge";
import { NovoDeposito } from "./NovoDeposito";
import { PeriodPill } from "./PeriodPill";

/**
 * Header actions for Início.
 * Pílula de período global · "Personalizar Home" (drawer) · "Novo lançamento"
 * (menu de ações). Demonstração badge em modo demo.
 */
export function InicioActions({ demo }: { demo: boolean }) {
  return (
    <>
      {demo && <DemoBadge />}
      <PeriodPill />
      <Button
        variant="secondary"
        leftIcon={<Icon name="settings" size={15} />}
        onClick={() => window.dispatchEvent(new Event("a4p:open-personalizar"))}
      >
        Personalizar Home
      </Button>
      <NovoDeposito />
    </>
  );
}
