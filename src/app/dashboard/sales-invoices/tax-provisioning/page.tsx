import { AppShell } from "@/components/app/AppShell";
import { ImpostosView } from "@/components/vendas-nf/OutrasViews";

export default function ImpostosPage() {
  return (
    <AppShell title="Provisionamento de Impostos" crumb="Vendas e NFs">
      <ImpostosView />
    </AppShell>
  );
}
