"use client";

import * as React from "react";
import { Button, Icon, DropdownMenu, type DropdownGroup } from "@/components/ui";
import { ReceitaForm } from "@/components/lancamentos/ReceitaForm";
import { TransferenciaForm } from "@/components/lancamentos/TransferenciaForm";
import { VendaCompraForm } from "@/components/lancamentos/VendaCompraForm";
import { ContratoForm } from "@/components/lancamentos/ContratoForm";
import { PartyForm } from "@/components/lancamentos/PartyForm";
import { ProdutoServicoForm } from "@/components/lancamentos/ProdutoServicoForm";
import { MarcaForm, UnidadeForm } from "@/components/lancamentos/MarcaUnidadeForm";
import { useTipoConta } from "@/components/app/useTipoConta";

/**
 * "Novo depósito" — primary button that opens a grouped action menu
 * (modeled on Conta Azul's "Novo registro"). Each item opens its own
 * form. Alt+letter shortcuts fire the action from anywhere.
 */
// Pessoa Física: só o essencial do dia a dia (receita/despesa/transferência).
const GROUPS_PESSOAL: DropdownGroup[] = [
  {
    label: "Adicionar",
    items: [
      { id: "despesa", label: "Nova despesa", shortcut: "D" },
      { id: "receita", label: "Nova receita", shortcut: "R" },
      { id: "transferencia", label: "Transferência entre contas", shortcut: "T" },
    ],
  },
];
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

const shortcutsDe = (groups: DropdownGroup[]): Record<string, string> => Object.fromEntries(
  groups.flatMap((g) =>
    g.items.filter((i) => i.shortcut).map((i) => [i.shortcut!.toLowerCase(), i.id]),
  ),
);

export function NovoDeposito() {
  const { pessoal } = useTipoConta();
  const groups = pessoal ? GROUPS_PESSOAL : GROUPS;
  const [action, setAction] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);

  React.useEffect(() => {
    const shortcuts = shortcutsDe(groups);
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const id = shortcuts[e.key.toLowerCase()];
      if (id) {
        e.preventDefault();
        setAction(id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [groups]);

  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const close = () => setAction(null);

  return (
    <>
      <DropdownMenu
        groups={groups}
        onSelect={setAction}
        menuLabel={pessoal ? "Adicionar" : "Novo registro"}
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
            {pessoal ? "Adicionar" : "Novo lançamento"}
          </Button>
        )}
      />

      {renderForm(action, close, setToast)}

      {toast && <Toast text={toast} />}
    </>
  );
}

function renderForm(
  action: string | null,
  close: () => void,
  onToast: (m: string) => void,
) {
  if (!action) return null;
  const p = { onClose: close, onToast };
  switch (action) {
    case "receita":
      return <ReceitaForm kind="receita" {...p} />;
    case "despesa":
      return <ReceitaForm kind="despesa" {...p} />;
    case "transferencia":
      return <TransferenciaForm {...p} />;
    case "venda-produto":
      return <VendaCompraForm docKind="venda" itemKind="produto" {...p} />;
    case "venda-servico":
      return <VendaCompraForm docKind="venda" itemKind="servico" {...p} />;
    case "orcamento":
      return <VendaCompraForm docKind="orcamento" itemKind="produto" {...p} />;
    case "compra-produto":
      return <VendaCompraForm docKind="compra" itemKind="produto" {...p} />;
    case "compra-servico":
      return <VendaCompraForm docKind="compra" itemKind="servico" {...p} />;
    case "contrato":
      return <ContratoForm {...p} />;
    case "produto":
      return <ProdutoServicoForm kind="produto" {...p} />;
    case "servico":
      return <ProdutoServicoForm kind="servico" {...p} />;
    case "cliente":
      return <PartyForm role="customer" {...p} />;
    case "fornecedor":
      return <PartyForm role="supplier" {...p} />;
    case "transportadora":
      return <PartyForm role="carrier" {...p} />;
    case "marca":
      return <MarcaForm {...p} />;
    case "unidade":
      return <UnidadeForm {...p} />;
    default:
      return null;
  }
}

function Toast({ text }: { text: string }) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-ink text-white text-[17px] font-medium px-4 py-[11px] rounded-md shadow-popover z-[70]">
      <Icon name="check" size={15} color="var(--color-lime)" />
      <span>{text}</span>
    </div>
  );
}
