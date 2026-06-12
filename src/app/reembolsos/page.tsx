"use client";

import { AppShell } from "@/components/app/AppShell";
import { ReembolsosView } from "@/components/reembolsos/ReembolsosView";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";

export default function ReembolsosPage() {
  return (
    <AppShell title="Reembolsos" crumb="Pagar · reembolso a colaboradores" actions={isDemo ? <DemoBadge /> : undefined}>
      <ReembolsosView />
    </AppShell>
  );
}
