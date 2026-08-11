import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { FolhaSalarial } from "@/components/contas-pagar/FolhaSalarial";

export default function FolhaSalarialPage() {
  return (
    <AppShell title="Folha salarial" crumb="Contas a pagar" actions={isDemo ? <DemoBadge /> : null}>
      <Suspense fallback={null}>
        <FolhaSalarial />
      </Suspense>
    </AppShell>
  );
}
