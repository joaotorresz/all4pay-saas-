import { AppShell } from "@/components/app/AppShell";
import { AssinaturasVendasView } from "@/components/vendas-nf/OutrasViews";

export default function AssinaturasPage() {
  return (
    <AppShell title="Assinaturas" crumb="Vendas e NFs">
      <AssinaturasVendasView />
    </AppShell>
  );
}
