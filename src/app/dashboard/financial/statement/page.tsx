import { AppShell } from "@/components/app/AppShell";
import { ExtratoView } from "@/components/movimentacoes/CaixaViews";

export default function ExtratoPage() {
  return (
    <AppShell title="Extrato" crumb="Financeiro">
      <ExtratoView />
    </AppShell>
  );
}
