import { AppShell } from "@/components/app/AppShell";
import { AssinaturasView } from "@/components/paineis/AssinaturasView";

export default function DashboardAssinaturasPage() {
  return (
    <AppShell title="Assinaturas (MRR e churn)" crumb="Dashboard">
      <AssinaturasView />
    </AppShell>
  );
}
