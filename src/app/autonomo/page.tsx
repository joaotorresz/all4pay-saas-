import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { AutonomoView } from "@/components/autonomo/AutonomoView";

/** O que o motor recomenda fazer agora; quem age é uma pessoa. Pro (`ROTAS_PRO` tranca `/autonomo` no servidor). Era aba da Quattro AI até 27/10/2026. */
export default function Page() {
  return (
    <AppShell title="Sugestões da IA" crumb="Inteligência" actions={isDemo ? <DemoBadge /> : null}>
      <AutonomoView />
    </AppShell>
  );
}
