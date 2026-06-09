"use client";

import { AppShell } from "@/components/app/AppShell";
import { EntityTable, NewButton, useToast, type Column } from "@/components/listas/ListChrome";
import { useServicesList } from "@/components/lancamentos/hooks";
import { ProdutoServicoForm } from "@/components/lancamentos/ProdutoServicoForm";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { Money } from "@/components/ui";
import { brlParts } from "@/lib/format";
import { isDemo } from "@/lib/demo";
import type { Service } from "@/lib/types";

const columns: Column<Service>[] = [
  {
    key: "name",
    label: "Serviço",
    render: (s) => (
      <div className="text-[14px] font-medium text-ink truncate">{s.name}</div>
    ),
  },
  {
    key: "price",
    label: "Preço",
    align: "right",
    width: 180,
    render: (s) => {
      const v = brlParts(s.price ?? 0);
      return <Money integer={v.integer} decimals={v.decimals} size="sm" />;
    },
  },
];

export default function ServicosPage() {
  const { data, isLoading, isError } = useServicesList();
  const { show, node } = useToast();
  return (
    <AppShell
      title="Serviços"
      crumb="Cadastros"
      actions={
        <>
          {isDemo && <DemoBadge />}
          <NewButton
            label="Novo serviço"
            onToast={show}
            form={(p) => <ProdutoServicoForm kind="servico" {...p} />}
          />
        </>
      }
    >
      <EntityTable
        columns={columns}
        rows={data}
        isLoading={isLoading}
        isError={isError}
        emptyTitle="Nenhum serviço cadastrado"
        emptyHint="Cadastre seu primeiro serviço no botão Novo serviço."
      />
      {node}
    </AppShell>
  );
}
