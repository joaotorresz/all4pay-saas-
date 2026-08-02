import { AppShell } from "@/components/app/AppShell";
import { DemonstrativoView } from "@/components/relatorios/DemonstrativoView";

export default function DFCPage() {
  return (
    <AppShell title="DFC" crumb="Relatórios">
      <DemonstrativoView tipo="dfc" />
    </AppShell>
  );
}
