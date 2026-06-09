"use client";

import * as React from "react";
import { Button, Pill, Icon } from "@/components/ui";
import { DemoBadge } from "./DemoBadge";
import { NovoDeposito } from "./NovoDeposito";

/**
 * Header actions for Início.
 * "Render mais ↗" yield pill · "Sacar" secondary · "Novo depósito" primary
 * (opens the grouped action menu). Demonstração badge when in demo mode.
 */
export function InicioActions({ demo }: { demo: boolean }) {
  const [toast, setToast] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <>
      {demo && <DemoBadge />}
      <Pill
        variant="yield"
        rightIcon={<Icon name="arrow-up-right" size={14} />}
        onClick={() => setToast("Simulação de rendimento aberta")}
      >
        Render mais
      </Pill>
      <Button
        variant="secondary"
        leftIcon={<Icon name="arrow-down-to-line" size={15} />}
        onClick={() => setToast("Saque iniciado")}
      >
        Sacar
      </Button>
      <NovoDeposito />

      {toast && <Toast text={toast} />}
    </>
  );
}

function Toast({ text }: { text: string }) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-ink text-white text-[14px] font-medium px-4 py-[11px] rounded-md shadow-popover z-[60]">
      <Icon name="check" size={15} color="var(--color-lime)" />
      <span>{text}</span>
    </div>
  );
}
