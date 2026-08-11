import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { DashboardContasReceber } from "@/components/contas-receber/DashboardContasReceber";

export default function ContasAReceberPage() {
  return (
    <AppShell
      title="Painel de contas a receber"
      crumb="Contas a receber"
      actions={isDemo ? <DemoBadge /> : null}
    >
      <Suspense fallback={null}>
        <DashboardContasReceber />
      </Suspense>
    </AppShell>
  );
}
