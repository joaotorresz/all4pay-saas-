import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { OrcamentoShell } from "@/components/orcamento/OrcamentoShell";

export default function OrcamentoPage() {
  return (
    <AppShell title="Orçamento" crumb="Caixa & Resultado" actions={isDemo ? <DemoBadge /> : null}>
      <Suspense fallback={null}>
        <OrcamentoShell />
      </Suspense>
    </AppShell>
  );
}
