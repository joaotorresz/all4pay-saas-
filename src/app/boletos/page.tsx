"use client";

import { AppShell } from "@/components/app/AppShell";
import { BoletosView } from "@/components/boletos/BoletosView";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";

export default function BoletosPage() {
  return (
    <AppShell title="Boleto" crumb="Receber · cobrança por boleto" actions={isDemo ? <DemoBadge /> : undefined}>
      <BoletosView />
    </AppShell>
  );
}
