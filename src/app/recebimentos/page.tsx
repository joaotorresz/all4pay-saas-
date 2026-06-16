"use client";

import { AppShell } from "@/components/app/AppShell";
import { CentralRecebimentosView } from "@/components/recebimentos/CentralRecebimentosView";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";

export default function RecebimentosPage() {
  return (
    <AppShell
      title="Central de Recebimentos"
      crumb="Receber · execução em lote"
      actions={isDemo ? <DemoBadge /> : undefined}
    >
      <CentralRecebimentosView />
    </AppShell>
  );
}
