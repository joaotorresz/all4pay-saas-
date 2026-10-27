import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { DecisaoView } from "@/components/decisao/DecisaoView";

/** Monte Carlo e recomendações com impacto. Pro (`ROTAS_PRO` tranca `/decisao` no servidor). Era aba da Quattro AI até 27/10/2026. */
export default function Page() {
  return (
    <AppShell title="Decisão" crumb="Inteligência" actions={isDemo ? <DemoBadge /> : null}>
      <DecisaoView />
    </AppShell>
  );
}
