import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { RiscoView } from "@/components/risco/RiscoView";

/** Runway, ruptura e stress de caixa. Pro (`ROTAS_PRO` tranca `/risco` no servidor). Era aba da Quattro AI até 27/10/2026. */
export default function Page() {
  return (
    <AppShell title="Risco de caixa" crumb="Inteligência" actions={isDemo ? <DemoBadge /> : null}>
      <RiscoView />
    </AppShell>
  );
}
