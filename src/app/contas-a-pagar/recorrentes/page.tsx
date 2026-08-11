import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { ContasRecorrentes } from "@/components/contas-pagar/ContasRecorrentes";

export default function ContasRecorrentesPage() {
  return (
    <AppShell title="Contas recorrentes" crumb="Contas a pagar" actions={isDemo ? <DemoBadge /> : null}>
      <Suspense fallback={null}>
        <ContasRecorrentes />
      </Suspense>
    </AppShell>
  );
}
