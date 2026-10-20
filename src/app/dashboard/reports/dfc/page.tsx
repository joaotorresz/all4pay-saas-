"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { HubShell, type AbaHub } from "@/components/app/HubShell";
import { DemonstrativoView } from "@/components/relatorios/DemonstrativoView";
import { FluxoCaixaMensalView } from "@/components/movimentacoes/CaixaViews";

/**
 * DFC — o caixa pela data de pagamento, em duas leituras do MESMO regime: o
 * demonstrativo do período e a planilha mês a mês (era "Fluxo de caixa
 * (relatório)", rota própria; reorganização dos menus, 19/10/2026).
 */
const ABAS: AbaHub[] = [
  { id: "periodo", label: "Por período", render: () => <DemonstrativoView tipo="dfc" /> },
  { id: "mensal", label: "Mês a mês (planilha)", render: () => <FluxoCaixaMensalView /> },
];

export default function DFCPage() {
  return (
    <AppShell title="DFC" crumb="Relatórios">
      <Suspense fallback={null}>
        <HubShell abas={ABAS} />
      </Suspense>
    </AppShell>
  );
}
