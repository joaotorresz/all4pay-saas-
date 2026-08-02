import { AppShell } from "@/components/app/AppShell";
import { DashboardHome } from "@/components/dashboard-home/DashboardHome";

export default function DashboardHomePage() {
  return (
    <AppShell title="Início" crumb="Dashboard">
      <DashboardHome />
    </AppShell>
  );
}
