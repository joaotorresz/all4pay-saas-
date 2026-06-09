"use client";

import * as React from "react";
import { Button, Pill, Card, Input, Money, Icon } from "@/components/ui";
import { DemoBadge } from "./DemoBadge";

/**
 * Header actions for Início — mirrors the reference TopBar:
 * "Render mais ↗" yield pill · "Sacar" secondary · "Depositar" primary
 * (opens a deposit modal). Plus the Demonstração badge when in demo mode.
 */
export function InicioActions({ demo }: { demo: boolean }) {
  const [deposit, setDeposit] = React.useState(false);
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
      <Button
        variant="primary"
        leftIcon={<Icon name="plus" size={15} />}
        onClick={() => setDeposit(true)}
      >
        Depositar
      </Button>

      {deposit && (
        <DepositModal
          onClose={() => setDeposit(false)}
          onDone={() => {
            setDeposit(false);
            setToast("Depósito iniciado");
          }}
        />
      )}
      {toast && <Toast text={toast} />}
    </>
  );
}

function DepositModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-ink/30 backdrop-blur-[2px] flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div className="w-[420px]" onClick={(e) => e.stopPropagation()}>
        <Card padded={false}>
          <div className="flex items-center justify-between px-5 py-[18px] border-b border-border-soft">
            <span className="text-[17px] font-medium">Depositar fundos</span>
            <button
              className="inline-flex bg-transparent cursor-pointer p-[2px]"
              onClick={onClose}
              aria-label="Fechar"
            >
              <Icon name="x" size={18} color="var(--color-text-secondary)" />
            </button>
          </div>
          <div className="px-5 py-[18px] flex flex-col gap-4">
            <Input label="Valor" prefix="R$" placeholder="0,00" defaultValue="50.000,00" />
            <Input label="De" defaultValue="Itaú · ••4021" />
            <div className="flex items-center justify-between px-[14px] py-3 bg-surface-2 rounded-md">
              <span className="text-label text-muted">Novo saldo consolidado</span>
              <Money integer="2.209.450" decimals="00" size="sm" />
            </div>
            <Button variant="primary" fullWidth onClick={onDone}>
              Confirmar depósito
            </Button>
          </div>
        </Card>
      </div>
    </div>
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
