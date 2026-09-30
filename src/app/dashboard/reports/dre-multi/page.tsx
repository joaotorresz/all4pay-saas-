import { AppShell } from "@/components/app/AppShell";
import { AtalhosTela } from "@/components/app/AtalhosTela";
import { MultiempresaView } from "@/components/relatorios/MultiempresaView";

export default function DREMultiPage() {
  return (
    <AppShell title="DRE multiempresas" crumb="Relatórios">
      <div className="flex flex-col gap-5">
        <AtalhosTela atalhos={[{ label: "DFC multiempresas", href: "/dashboard/reports/dfc-multi", icon: "building" }]} />
        <MultiempresaView tipo="dre" />
      </div>
    </AppShell>
  );
}
