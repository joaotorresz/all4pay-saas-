import { AppShell } from "@/components/app/AppShell";
import { FluxoCaixaMensalView } from "@/components/movimentacoes/CaixaViews";

export default function FluxoDeCaixaMensalPage() {
  return (
    <AppShell title="Fluxo de caixa (relatório)" crumb="Relatórios">
      <FluxoCaixaMensalView />
    </AppShell>
  );
}
