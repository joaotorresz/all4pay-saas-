"use client";

import { AppShell } from "@/components/app/AppShell";
import { RecorrenciasView } from "@/components/recorrencias/RecorrenciasView";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";

export default function RecorrenciasPage() {
  return (
    <AppShell title="Recorrências" crumb="Receber · receita recorrente (MRR)" actions={isDemo ? <DemoBadge /> : undefined}>
      <RecorrenciasView />
    </AppShell>
  );
}
