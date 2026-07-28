"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { HubShell, type AbaHub } from "@/components/app/HubShell";
import { VendasListaPage } from "./lista";
import { NotasFiscaisLista } from "@/app/notas-fiscais/lista";
import { VendasDashboardView } from "@/components/dashboards/VendasDashboardView";
import { NovaVendaIuli } from "@/components/vendas/NovaVendaIuli";
import { PosVendaView } from "@/components/pos/PosVendaView";
import { CentralPosTaxasView } from "@/components/pos/CentralPosTaxasView";

/**
 * Hub de Vendas & NFs — a lista, o painel, a emissão, as notas e a maquininha
 * (POS) num destino só. O POS estava órfão do menu; aqui ele fica onde o
 * usuário procura por ele.
 */
const ABAS: AbaHub[] = [
  { id: "lista", label: "Vendas", render: () => <VendasListaPage /> },
  { id: "painel", label: "Painel de vendas", render: () => <VendasDashboardView /> },
  { id: "nova", label: "Nova venda", render: () => <NovaVendaIuli /> },
  { id: "notas", label: "Notas fiscais", render: () => <NotasFiscaisLista /> },
  { id: "pos", label: "Maquininha (POS)", render: () => <PosVendaView /> },
  { id: "pos-taxas", label: "Taxas da maquininha", render: () => <CentralPosTaxasView /> },
];

export default function VendasHubPage() {
  return (
    <AppShell title="Vendas e NFs" crumb="Vendas">
      <Suspense fallback={null}>
        <HubShell abas={ABAS} />
      </Suspense>
    </AppShell>
  );
}
