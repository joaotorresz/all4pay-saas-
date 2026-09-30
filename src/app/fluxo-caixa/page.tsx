"use client";

import { AppShell } from "@/components/app/AppShell";
import { AtalhosTela } from "@/components/app/AtalhosTela";
import { FluxoCaixaView } from "@/components/fluxo-caixa/FluxoCaixaView";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";

export default function FluxoCaixaPage() {
  return (
    <AppShell
      title="Fluxo de caixa"
      crumb="Centro operacional do caixa"
      actions={isDemo ? <DemoBadge /> : undefined}
    >
      <div className="flex flex-col gap-5">
        {/* O relatório do mês fechado saiu do menu de Relatórios e mora aqui. */}
        <AtalhosTela
          rotulo="Relatórios de caixa"
          atalhos={[
            { label: "Fluxo de caixa do mês (planilha)", href: "/dashboard/reports/cash-flow", icon: "arrow-down-to-line" },
            { label: "DFC", href: "/dashboard/reports/dfc", icon: "trending-up" },
          ]}
        />
        <FluxoCaixaView />
      </div>
    </AppShell>
  );
}
