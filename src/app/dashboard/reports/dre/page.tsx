import { AppShell } from "@/components/app/AppShell";
import { DemonstrativoView } from "@/components/relatorios/DemonstrativoView";

export default function DREPage() {
  return (
    <AppShell title="DRE" crumb="Relatórios">
      <DemonstrativoView tipo="dre" />
    </AppShell>
  );
}
