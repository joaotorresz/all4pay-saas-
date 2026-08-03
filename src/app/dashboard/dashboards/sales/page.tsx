import { AppShell } from "@/components/app/AppShell";
import { VendasView } from "@/components/paineis/VendasView";

export default function DashboardVendasPage() {
  return (
    <AppShell title="Painel de vendas" crumb="Dashboard">
      <VendasView />
    </AppShell>
  );
}
