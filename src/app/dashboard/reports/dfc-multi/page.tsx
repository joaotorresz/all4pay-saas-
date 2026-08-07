import { AppShell } from "@/components/app/AppShell";
import { MultiempresaView } from "@/components/relatorios/MultiempresaView";

export default function DFCMultiPage() {
  return (
    <AppShell title="DFC multiempresas" crumb="Relatórios">
      <MultiempresaView tipo="dfc" />
    </AppShell>
  );
}
