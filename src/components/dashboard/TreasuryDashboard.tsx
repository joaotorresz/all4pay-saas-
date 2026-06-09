"use client";

import * as React from "react";
import { Card, Input, Button, Pill, Money, Icon } from "@/components/ui";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { BalanceCard } from "./BalanceCard";
import { AccountsList } from "./AccountsList";
import { InvoiceTable, INVOICES } from "./InvoiceTable";

/**
 * Treasury dashboard — the app shell composed entirely from DS primitives.
 * Holds nav, row-selection, deposit-modal and toast state.
 */
export function TreasuryDashboard() {
  const [active, setActive] = React.useState("home");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [deposit, setDeposit] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const toggleAll = () =>
    setSelected((s) =>
      s.size === INVOICES.length
        ? new Set()
        : new Set(INVOICES.map((i) => i.id)),
    );

  const schedule = () => {
    const n = selected.size;
    setSelected(new Set());
    setToast(`${n} pagamento${n > 1 ? "s" : ""} agendado${n > 1 ? "s" : ""}`);
  };

  return (
    <div className="flex h-screen w-screen bg-surface-1 overflow-hidden">
      <Sidebar active={active} onNavigate={setActive} />

      <main className="flex-1 flex flex-col min-w-0 min-h-0">
        <TopBar title="Tesouraria" onDeposit={() => setDeposit(true)} />

        <div className="flex-1 overflow-y-auto px-8 pb-10">
          <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
            <div className="flex flex-col gap-5 min-w-0">
              <BalanceCard />
              <InvoiceTable
                selected={selected}
                onToggle={toggle}
                onToggleAll={toggleAll}
                onSchedule={schedule}
              />
            </div>
            <div className="flex flex-col gap-5">
              <AccountsList />
              <YieldPromo />
            </div>
          </div>
        </div>
      </main>

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
    </div>
  );
}

function YieldPromo() {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="w-[30px] h-[30px] rounded-sm bg-lime inline-flex items-center justify-center">
          <Icon name="sparkles" size={16} color="var(--color-ink)" />
        </span>
        <span className="text-body font-medium">Dinheiro parado rendendo 0%</span>
      </div>
      <p className="m-0 text-label leading-[1.5] text-muted">
        Mova fundos para a Tesouraria e renda até{" "}
        <strong className="text-ink font-medium">4,31%</strong> a.a., resgatável
        a qualquer momento.
      </p>
      <Pill
        variant="yield"
        rightIcon={<Icon name="arrow-up-right" size={14} />}
        className="self-start"
      >
        Render mais
      </Pill>
    </Card>
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
            >
              <Icon name="x" size={18} color="var(--color-text-secondary)" />
            </button>
          </div>
          <div className="px-5 py-[18px] flex flex-col gap-4">
            <Input
              label="Valor"
              prefix="R$"
              placeholder="0,00"
              defaultValue="50.000,00"
            />
            <Input label="De" defaultValue="Itaú · ••4021" />
            <div className="flex items-center justify-between px-[14px] py-3 bg-surface-2 rounded-md">
              <span className="text-label text-muted">
                Novo saldo da Tesouraria
              </span>
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
