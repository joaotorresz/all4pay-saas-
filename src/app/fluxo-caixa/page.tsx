"use client";

import { AppShell } from "@/components/app/AppShell";
import { FluxoCaixaView } from "@/components/fluxo-caixa/FluxoCaixaView";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";

export default function FluxoCaixaPage() {
  return (
    <AppShell
      title="Fluxo de Caixa"
      crumb="Centro operacional do caixa"
      actions={isDemo ? <DemoBadge /> : undefined}
    >
      <FluxoCaixaView />
    </AppShell>
  );
}
