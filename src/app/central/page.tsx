import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { CentralView } from "@/components/central/CentralView";

export default function CentralPage() {
  return (
    <AppShell title="Central financeira" crumb="Confirmação e baixa" actions={isDemo ? <DemoBadge /> : null}>
      <Suspense fallback={null}>
        <CentralView />
      </Suspense>
    </AppShell>
  );
}
