import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { DashboardContasPagar } from "@/components/contas-pagar/DashboardContasPagar";

export default function ContasAPagarPage() {
  return (
    <AppShell
      title="Painel de contas a pagar"
      crumb="Contas a pagar"
      actions={isDemo ? <DemoBadge /> : null}
    >
      <Suspense fallback={null}>
        <DashboardContasPagar />
      </Suspense>
    </AppShell>
  );
}
