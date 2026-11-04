"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Button, Icon } from "@/components/ui";

/* ---------- "Novo X" button that opens a form ---------- */

export function NewButton({
  label,
  onToast,
  form,
  variant = "primary",
}: {
  label: string;
  onToast: (m: string) => void;
  form: (props: { onClose: () => void; onToast: (m: string) => void }) => React.ReactNode;
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        variant={variant}
        leftIcon={<Icon name="plus" size={15} />}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      {open && form({ onClose: () => setOpen(false), onToast })}
    </>
  );
}

/* ---------- Toast ---------- */

export function useToast() {
  const [toast, setToast] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!toast) return;
    // Mensagem longa (o motivo de uma recusa) precisa de tempo para ser lida.
    const t = setTimeout(() => setToast(null), Math.max(3200, toast.length * 70));
    return () => clearTimeout(t);
  }, [toast]);
  // Portal no <body>: o toast é `fixed`, e qualquer ancestral com `transform`
  // (o Card do DS tem a micro-elevação) vira o bloco de contenção — dentro de
  // um card ele ancorava no rodapé do card, não da tela.
  const node = toast
    ? createPortal(
        <div className="fixed bottom-[calc(24px+var(--a4p-barra-baixo,0px))] left-1/2 -translate-x-1/2 flex items-center gap-2 bg-ink text-white text-[17px] font-medium px-4 py-[11px] rounded-md shadow-popover z-[70]">
          <Icon name="check" size={15} color="var(--color-lime)" />
          <span>{toast}</span>
        </div>,
        document.body,
      )
    : null;
  return { show: setToast, node };
}
