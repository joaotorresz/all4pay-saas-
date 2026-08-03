import { AppShell } from "@/components/app/AppShell";
import { FinanceiroView } from "@/components/paineis/FinanceiroView";

export default function DashboardFinanceiroPage() {
  return (
    <AppShell title="Painel financeiro" crumb="Dashboard">
      <FinanceiroView />
    </AppShell>
  );
}
