import { AppShell } from "@/components/app/AppShell";
import { NotasFiscaisView } from "@/components/vendas-nf/OutrasViews";

export default function NotasFiscaisPage() {
  return (
    <AppShell title="Notas fiscais" crumb="Vendas e NFs">
      <NotasFiscaisView />
    </AppShell>
  );
}
