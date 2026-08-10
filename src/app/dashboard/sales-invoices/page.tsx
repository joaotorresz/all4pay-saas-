import { AppShell } from "@/components/app/AppShell";
import { VendasView } from "@/components/vendas-nf/VendasView";

export default function VendasPage() {
  return (
    <AppShell title="Painel de vendas" crumb="Vendas e NFs">
      <VendasView />
    </AppShell>
  );
}
