import { AppShell } from "@/components/app/AppShell";
import { AssinaturasVendasView } from "@/components/vendas-nf/OutrasViews";

export default function AssinaturasPage() {
  return (
    <AppShell title="Assinaturas e recorrência" crumb="Vendas e NFs">
      <AssinaturasVendasView />
    </AppShell>
  );
}
