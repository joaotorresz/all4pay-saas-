import { AppShell } from "@/components/app/AppShell";
import { MultiempresaView } from "@/components/relatorios/MultiempresaView";

export default function DFCMultiPage() {
  return (
    <AppShell title="DFC Multiempresas" crumb="Relatórios">
      <MultiempresaView tipo="dfc" />
    </AppShell>
  );
}
