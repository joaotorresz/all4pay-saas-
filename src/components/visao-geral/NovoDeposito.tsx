"use client";

import * as React from "react";
import { Button, Card, Icon, DropdownMenu, type DropdownGroup } from "@/components/ui";

/**
 * "Novo depósito" — primary button that opens a grouped action menu
 * (modeled on Conta Azul's "Novo registro"). Each item opens its own
 * modal/form. Alt+letter shortcuts fire the action from anywhere.
 *
 * PASSO 1: the menu + shortcuts are fully wired. RECEITA is the mold and
 * is the first form to be implemented (next step); the others open a
 * consistent placeholder until built.
 */
const GROUPS: DropdownGroup[] = [
  {
    label: "Lançamentos",
    items: [
      { id: "receita", label: "Receita", shortcut: "R" },
      { id: "despesa", label: "Despesa", shortcut: "D" },
      { id: "transferencia", label: "Transferência", shortcut: "T" },
    ],
  },
  {
    label: "Vendas / Compras",
    items: [
      { id: "venda-produto", label: "Venda de produto", shortcut: "V" },
      { id: "venda-servico", label: "Venda de serviço" },
      { id: "orcamento", label: "Orçamento", shortcut: "O" },
      { id: "compra-produto", label: "Compra de produto", shortcut: "P" },
      { id: "compra-servico", label: "Compra de serviço" },
      { id: "contrato", label: "Contrato", shortcut: "B" },
    ],
  },
  {
    label: "Cadastros",
    items: [
      { id: "produto", label: "Produto", shortcut: "X" },
      { id: "servico", label: "Serviço", shortcut: "Q" },
      { id: "cliente", label: "Cliente", shortcut: "L" },
      { id: "fornecedor", label: "Fornecedor", shortcut: "F" },
      { id: "transportadora", label: "Transportadora" },
      { id: "marca", label: "Marca" },
      { id: "unidade", label: "Unidade de medida" },
    ],
  },
];

const LABELS: Record<string, string> = Object.fromEntries(
  GROUPS.flatMap((g) => g.items.map((i) => [i.id, i.label])),
);
const SHORTCUTS: Record<string, string> = Object.fromEntries(
  GROUPS.flatMap((g) =>
    g.items
      .filter((i) => i.shortcut)
      .map((i) => [i.shortcut!.toLowerCase(), i.id]),
  ),
);

export function NovoDeposito() {
  const [action, setAction] = React.useState<string | null>(null);

  // Alt+letter shortcuts — fire the matching action from anywhere.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const id = SHORTCUTS[e.key.toLowerCase()];
      if (id) {
        e.preventDefault();
        setAction(id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <DropdownMenu
        groups={GROUPS}
        onSelect={setAction}
        menuLabel="Novo registro"
        width={272}
        trigger={({ open, toggle }) => (
          <Button
            variant="primary"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={toggle}
            rightIcon={<Icon name="chevron-down" size={15} />}
            leftIcon={<Icon name="plus" size={15} />}
          >
            Novo depósito
          </Button>
        )}
      />

      {action && (
        <ActionModal
          id={action}
          label={LABELS[action] ?? "Ação"}
          onClose={() => setAction(null)}
        />
      )}
    </>
  );
}

/** Placeholder shown until each action's form is built (next steps). */
function ActionModal({
  id,
  label,
  onClose,
}: {
  id: string;
  label: string;
  onClose: () => void;
}) {
  const isReceita = id === "receita";
  return (
    <div
      className="fixed inset-0 bg-ink/30 backdrop-blur-[2px] flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div className="w-[440px]" onClick={(e) => e.stopPropagation()}>
        <Card padded={false}>
          <div className="flex items-center justify-between px-5 py-[18px] border-b border-border-soft">
            <span className="text-[17px] font-medium">{label}</span>
            <button
              className="inline-flex bg-transparent cursor-pointer p-[2px]"
              onClick={onClose}
              aria-label="Fechar"
            >
              <Icon name="x" size={18} color="var(--color-text-secondary)" />
            </button>
          </div>
          <div className="px-5 py-6 flex flex-col gap-3">
            <p className="m-0 text-body text-muted">
              {isReceita
                ? "Receita é o molde base dos lançamentos — será o primeiro formulário implementado, na próxima etapa (após aprovação do schema)."
                : "Formulário em construção. Esta ação será implementada reusando o molde de Receita."}
            </p>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={onClose}>
                Fechar
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
