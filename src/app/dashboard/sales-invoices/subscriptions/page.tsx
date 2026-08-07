import { AppShell } from "@/components/app/AppShell";
import { AssinaturasVendasView } from "@/components/vendas-nf/OutrasViews";

export default function AssinaturasPage() {
  return (
    <AppShell title="Assinaturas e contratos" crumb="Vendas e NFs">
      <AssinaturasVendasView />
    </AppShell>
  );
}
