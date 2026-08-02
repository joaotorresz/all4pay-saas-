"use client";

/**
 * Hub dos dashboards — um destino de menu, sete telas.
 *
 * Cada painel continua morando na rota própria (`/dashboard/dashboards/sales`
 * etc.) e abre sozinho; aqui eles viram abas para o menu não ganhar sete
 * entradas novas. É o mesmo padrão de `/contabilidade` e `/cadastros`.
 */
import * as React from "react";
import { AppShell } from "@/components/app/AppShell";
import { HubShell, type AbaHub } from "@/components/app/HubShell";
import { FinanceiroView } from "@/components/paineis/FinanceiroView";
import { VendasView } from "@/components/paineis/VendasView";
import { AssinaturasView } from "@/components/paineis/AssinaturasView";
import { TitulosView } from "@/components/paineis/TitulosView";
import { CalendarioView } from "@/components/paineis/CalendarioView";
import { DashboardsCustomView } from "@/components/dashboards-custom/DashboardsCustomView";

const ABAS: AbaHub[] = [
  { id: "financeiro", label: "Financeiro", render: () => <FinanceiroView /> },
  { id: "vendas", label: "Vendas", render: () => <VendasView /> },
  { id: "assinaturas", label: "Assinaturas", render: () => <AssinaturasView /> },
  { id: "pagar", label: "Contas a pagar", render: () => <TitulosView direcao="pagar" /> },
  { id: "receber", label: "Contas a receber", render: () => <TitulosView direcao="receber" /> },
  { id: "calendario", label: "Calendário", render: () => <CalendarioView /> },
  { id: "meus", label: "Meus dashboards", render: () => <DashboardsCustomView /> },
];

export default function DashboardsHubPage() {
  return (
    <AppShell title="Dashboards" crumb="Dashboard">
      <React.Suspense fallback={null}>
        <HubShell abas={ABAS} />
      </React.Suspense>
    </AppShell>
  );
}
