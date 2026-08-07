import { AppShell } from "@/components/app/AppShell";
import { FaturaCartaoView } from "@/components/movimentacoes/CaixaViews";

export default function FaturaCartaoPage() {
  return (
    <AppShell title="Fatura do cartão" crumb="Financeiro">
      <FaturaCartaoView />
    </AppShell>
  );
}
