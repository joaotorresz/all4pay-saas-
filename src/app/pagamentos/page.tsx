"use client";

import { AppShell } from "@/components/app/AppShell";
import { CentralPagamentosView } from "@/components/pagamentos/CentralPagamentosView";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";

export default function PagamentosPage() {
  return (
    <AppShell
      title="Central de Pagamentos"
      crumb="Pagar · execução em lote"
      actions={isDemo ? <DemoBadge /> : undefined}
    >
      <CentralPagamentosView />
    </AppShell>
  );
}
