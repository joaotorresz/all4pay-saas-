"use client";

import * as React from "react";
import { Button, Icon, DropdownMenu, type DropdownGroup } from "@/components/ui";
import { abrirCriacao } from "@/components/app/criacao";
import type { TipoCriacao } from "@/core/criar";
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

/**
 * ⚠️ Cada item abre a PORTA ÚNICA (`abrirCriacao`): o mesmo pop-up do Criar,
 * do botão da tela e do menu. Antes este menu tinha os SEUS formulários — a
 * "Venda de produto" daqui gravava outra coisa que a "Nova venda" do Painel.
 */
const TIPO_DO_ITEM: Record<string, TipoCriacao> = {
  receita: "receber", despesa: "pagar", transferencia: "transferencia",
  "venda-produto": "venda", "venda-servico": "venda", orcamento: "orcamento-venda",
  "compra-produto": "compra", "compra-servico": "compra", contrato: "contrato-cliente",
  produto: "produto", servico: "servico", cliente: "cliente", fornecedor: "fornecedor",
  transportadora: "transportadora", marca: "marca", unidade: "unidade",
};

const abrir = (id: string) => { const t = TIPO_DO_ITEM[id]; if (t) abrirCriacao(t); };

export function NovoDeposito() {
  const { pessoal } = useTipoConta();
  const groups = pessoal ? GROUPS_PESSOAL : GROUPS;

  React.useEffect(() => {
    const shortcuts = shortcutsDe(groups);
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const id = shortcuts[e.key.toLowerCase()];
      if (id) {
        e.preventDefault();
        abrir(id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [groups]);

  return (
    <DropdownMenu
      groups={groups}
      onSelect={abrir}
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
  );
}
