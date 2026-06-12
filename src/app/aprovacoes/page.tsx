"use client";

import { AppShell } from "@/components/app/AppShell";
import { AprovacoesView } from "@/components/aprovacoes/AprovacoesView";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";

export default function AprovacoesPage() {
  return (
    <AppShell title="Solicitações & aprovações" crumb="Pagar · gate de alçada" actions={isDemo ? <DemoBadge /> : undefined}>
      <AprovacoesView />
    </AppShell>
  );
}
