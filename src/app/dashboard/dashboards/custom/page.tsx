import { AppShell } from "@/components/app/AppShell";
import { DashboardsCustomView } from "@/components/dashboards-custom/DashboardsCustomView";

export default function DashboardsCustomPage() {
  return (
    <AppShell title="Meus painéis" crumb="Relatórios">
      <DashboardsCustomView />
    </AppShell>
  );
}
