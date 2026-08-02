import { AppShell } from "@/components/app/AppShell";
import { AssinaturasView } from "@/components/paineis/AssinaturasView";

export default function DashboardAssinaturasPage() {
  return (
    <AppShell title="Dashboard de Assinaturas" crumb="Dashboard">
      <AssinaturasView />
    </AppShell>
  );
}
