import { AppShell } from "@/components/app/AppShell";
import { ConsolidadoView } from "@/components/consolidado/ConsolidadoView";

/**
 * A posição consolidada do grupo — era aba de Multiempresas (27/10/2026).
 * ⚠️ Continua Pro: `/consolidado` está em `ROTAS_PRO`, e o middleware tranca
 * pelo prefixo (antes era o par rota+aba de `ABAS_PRO`).
 */
export default function ConsolidadoPage() {
  return (
    <AppShell title="Posição consolidada" crumb="Relatórios">
      <ConsolidadoView />
    </AppShell>
  );
}
