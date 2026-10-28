import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { OrcamentoVarianciaView } from "@/components/orcamento/OrcamentoView";

/** Planejado × Realizado — o que foi orçado contra o que de fato aconteceu. */
export default function PlanejadoRealizadoPage() {
  return (
    <AppShell title="Planejado × Realizado" crumb="Relatórios" actions={isDemo ? <DemoBadge /> : null}>
      <OrcamentoVarianciaView />
    </AppShell>
  );
}
