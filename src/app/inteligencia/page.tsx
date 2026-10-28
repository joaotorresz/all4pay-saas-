import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { QuantView } from "@/components/quant/QuantView";

/** Score de saúde, radar e cenários. Pro (`ROTAS_PRO` tranca `/inteligencia` no servidor). Era aba da Quattro AI até 27/10/2026. */
export default function Page() {
  return (
    <AppShell title="Saúde financeira" crumb="Inteligência" actions={isDemo ? <DemoBadge /> : null}>
      <QuantView />
    </AppShell>
  );
}
