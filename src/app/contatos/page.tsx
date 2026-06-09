"use client";

import { AppShell } from "@/components/app/AppShell";
import { EntityTable, NewButton, useToast, type Column } from "@/components/listas/ListChrome";
import { usePartiesList } from "@/components/lancamentos/hooks";
import { PartyForm } from "@/components/lancamentos/PartyForm";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { Badge } from "@/components/ui";
import { isDemo } from "@/lib/demo";
import type { Party } from "@/lib/types";

const columns: Column<Party>[] = [
  {
    key: "name",
    label: "Nome / Razão social",
    render: (p) => (
      <div className="min-w-0">
        <div className="text-[14px] font-medium text-ink truncate">{p.name}</div>
        {p.doc && <div className="text-caption text-faint tabular-nums">{p.doc}</div>}
      </div>
    ),
  },
  {
    key: "type",
    label: "Tipo",
    width: 70,
    render: (p) => (
      <span className="text-label text-muted uppercase">{p.type}</span>
    ),
  },
  {
    key: "role",
    label: "Papel",
    width: 220,
    render: (p) => (
      <span className="flex gap-[6px]">
        {p.is_customer && <Badge variant="neutral">Cliente</Badge>}
        {p.is_supplier && <Badge variant="neutral">Fornecedor</Badge>}
        {p.is_carrier && <Badge variant="neutral">Transportadora</Badge>}
      </span>
    ),
  },
];

export default function ContatosPage() {
  const { data, isLoading, isError } = usePartiesList();
  const { show, node } = useToast();
  return (
    <AppShell
      title="Contatos"
      crumb="Cadastros"
      actions={
        <>
          {isDemo && <DemoBadge />}
          <NewButton
            label="Novo fornecedor"
            variant="secondary"
            onToast={show}
            form={(p) => <PartyForm role="supplier" {...p} />}
          />
          <NewButton
            label="Novo cliente"
            onToast={show}
            form={(p) => <PartyForm role="customer" {...p} />}
          />
        </>
      }
    >
      <EntityTable
        columns={columns}
        rows={data}
        isLoading={isLoading}
        isError={isError}
        emptyTitle="Nenhum contato cadastrado"
        emptyHint="Cadastre clientes e fornecedores pelos botões acima."
      />
      {node}
    </AppShell>
  );
}
