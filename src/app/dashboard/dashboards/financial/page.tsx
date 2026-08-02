import { AppShell } from "@/components/app/AppShell";
import { FinanceiroView } from "@/components/paineis/FinanceiroView";

export default function DashboardFinanceiroPage() {
  return (
    <AppShell title="Dashboard Financeiro" crumb="Dashboard">
      <FinanceiroView />
    </AppShell>
  );
}
