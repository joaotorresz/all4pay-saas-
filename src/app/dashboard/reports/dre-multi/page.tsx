import { AppShell } from "@/components/app/AppShell";
import { MultiempresaView } from "@/components/relatorios/MultiempresaView";

export default function DREMultiPage() {
  return (
    <AppShell title="DRE Multiempresas" crumb="Relatórios">
      <MultiempresaView tipo="dre" />
    </AppShell>
  );
}
