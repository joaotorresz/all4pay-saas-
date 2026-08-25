import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { ExportarView } from "@/components/exportar/ExportarView";

export default function ExportarPage() {
  return (
    <AppShell
      title="Exportar para o contador"
      crumb="Razão e DRE do período"
      actions={isDemo ? <DemoBadge /> : null}
    >
      <Suspense fallback={null}>
        <ExportarView />
      </Suspense>
    </AppShell>
  );
}
