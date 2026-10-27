import { AppShell } from "@/components/app/AppShell";
import { MultiempresaView } from "@/components/relatorios/MultiempresaView";

/** O DFC do grupo — era aba de Multiempresas (27/10/2026). */
export default function DfcMultiPage() {
  return (
    <AppShell title="DFC multiempresas" crumb="Relatórios">
      <MultiempresaView tipo="dfc" />
    </AppShell>
  );
}
