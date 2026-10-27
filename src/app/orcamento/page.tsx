import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { OrcamentosView } from "@/components/registros/OrcamentosView";

/**
 * Orçamentos — o cadastro do previsto. O confronto com o real tem a sua
 * página (`/orcamento/realizado`): eram duas abas da mesma tela (27/10/2026).
 */
export default function OrcamentoPage() {
  return (
    <AppShell title="Orçamentos" crumb="Relatórios" actions={isDemo ? <DemoBadge /> : null}>
      <OrcamentosView />
    </AppShell>
  );
}
