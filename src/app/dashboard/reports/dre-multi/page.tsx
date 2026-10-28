import { AppShell } from "@/components/app/AppShell";
import { MultiempresaView } from "@/components/relatorios/MultiempresaView";

/**
 * O DRE do grupo. "Multiempresas" tinha três abas (27/10/2026, fim das abas
 * internas): o DFC voltou a `/dashboard/reports/dfc-multi` e a posição
 * consolidada a `/consolidado` (Pro pelo prefixo em `ROTAS_PRO`).
 */
export default function DreMultiPage() {
  return (
    <AppShell title="DRE multiempresas" crumb="Relatórios">
      <MultiempresaView tipo="dre" />
    </AppShell>
  );
}
