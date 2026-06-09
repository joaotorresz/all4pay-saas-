"use client";

import { AppShell } from "@/components/app/AppShell";
import { EntityTable, NewButton, useToast, type Column } from "@/components/listas/ListChrome";
import { useProductsList } from "@/components/lancamentos/hooks";
import { ProdutoServicoForm } from "@/components/lancamentos/ProdutoServicoForm";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { Money } from "@/components/ui";
import { brlParts } from "@/lib/format";
import { isDemo } from "@/lib/demo";
import type { Product } from "@/lib/types";

const columns: Column<Product>[] = [
  {
    key: "name",
    label: "Produto",
    render: (p) => (
      <div className="min-w-0">
        <div className="text-[14px] font-medium text-ink truncate">{p.name}</div>
        {p.sku && <div className="text-caption text-faint">{p.sku}</div>}
      </div>
    ),
  },
  {
    key: "price",
    label: "Preço de venda",
    align: "right",
    width: 180,
    render: (p) => {
      const v = brlParts(p.sale_price ?? 0);
      return <Money integer={v.integer} decimals={v.decimals} size="sm" />;
    },
  },
];

export default function ProdutosPage() {
  const { data, isLoading, isError } = useProductsList();
  const { show, node } = useToast();
  return (
    <AppShell
      title="Produtos"
      crumb="Cadastros"
      actions={
        <>
          {isDemo && <DemoBadge />}
          <NewButton
            label="Novo produto"
            onToast={show}
            form={(p) => <ProdutoServicoForm kind="produto" {...p} />}
          />
        </>
      }
    >
      <EntityTable
        columns={columns}
        rows={data}
        isLoading={isLoading}
        isError={isError}
        emptyTitle="Nenhum produto cadastrado"
        emptyHint="Cadastre seu primeiro produto no botão Novo produto."
      />
      {node}
    </AppShell>
  );
}
