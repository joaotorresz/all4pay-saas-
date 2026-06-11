"use client";

import { AppShell } from "@/components/app/AppShell";
import { EntityTable, NewButton, useToast, type Column } from "@/components/listas/ListChrome";
import { useSalesList } from "@/components/lancamentos/hooks";
import { VendaCompraForm } from "@/components/lancamentos/VendaCompraForm";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { Money, StatusBadge } from "@/components/ui";
import { brlParts } from "@/lib/format";
import { isDemo } from "@/lib/demo";
import type { SaleDocRow } from "@/lib/types";

const KIND_LABEL: Record<string, string> = {
  venda: "Venda",
  compra: "Compra",
  orcamento: "Orçamento",
};
const STATUS_TONE: Record<string, "neutral" | "positive" | "warning"> = {
  aberto: "neutral",
  faturado: "positive",
  orcamento: "warning",
};

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
};

const columns: Column<SaleDocRow>[] = [
  {
    key: "doc",
    label: "Documento",
    render: (r) => (
      <div className="min-w-0">
        <div className="text-[17px] font-medium text-ink truncate">{r.party_name}</div>
        <div className="text-caption text-faint tabular-nums">
          {r.id} · {KIND_LABEL[r.kind] ?? r.kind} de {r.item_kind}
        </div>
      </div>
    ),
  },
  { key: "date", label: "Data", width: 90, render: (r) => <span className="text-label text-muted tabular-nums">{fmtDate(r.doc_date)}</span> },
  {
    key: "status",
    label: "Status",
    width: 130,
    render: (r) => <StatusBadge tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</StatusBadge>,
  },
  {
    key: "total",
    label: "Total",
    align: "right",
    width: 150,
    render: (r) => {
      const v = brlParts(r.total);
      return <Money integer={v.integer} decimals={v.decimals} size="sm" />;
    },
  },
];

export default function VendasPage() {
  const { data, isLoading, isError } = useSalesList();
  const { show, node } = useToast();
  return (
    <AppShell
      title="Vendas"
      crumb="Vendas / Compras"
      actions={
        <>
          {isDemo && <DemoBadge />}
          <NewButton
            label="Nova venda"
            onToast={show}
            form={(p) => <VendaCompraForm docKind="venda" itemKind="produto" {...p} />}
          />
        </>
      }
    >
      <EntityTable
        columns={columns}
        rows={data}
        isLoading={isLoading}
        isError={isError}
        emptyTitle="Nenhuma venda registrada"
        emptyHint="Registre uma venda no botão Nova venda."
      />
      {node}
    </AppShell>
  );
}
