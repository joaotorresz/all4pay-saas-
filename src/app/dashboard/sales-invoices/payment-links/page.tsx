import { AppShell } from "@/components/app/AppShell";
import { LinksPagamentoView } from "@/components/vendas-nf/OutrasViews";

export default function LinksPagamentoPage() {
  return (
    <AppShell title="Links de pagamento" crumb="Vendas e NFs">
      <LinksPagamentoView />
    </AppShell>
  );
}
