import { AppShell } from "@/components/app/AppShell";
import { FluxoCaixaMensalView } from "@/components/movimentacoes/CaixaViews";

export default function FluxoDeCaixaMensalPage() {
  return (
    <AppShell title="Fluxo de Caixa" crumb="Relatórios">
      <FluxoCaixaMensalView />
    </AppShell>
  );
}
