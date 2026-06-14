"use client";

import { AppShell } from "@/components/app/AppShell";
import { ContasView } from "@/components/contas/ContasView";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";

export default function ContasPage() {
  return (
    <AppShell title="Contas financeiras" crumb="Contas · posição por banco" actions={isDemo ? <DemoBadge /> : undefined}>
      <ContasView />
    </AppShell>
  );
}
