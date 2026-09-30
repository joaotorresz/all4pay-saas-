import { AppShell } from "@/components/app/AppShell";
import { FechamentoMesView } from "@/components/fechamento/FechamentoMesView";

export default function FechamentoMensalPage() {
  return (
    <AppShell title="Fechamento mensal" crumb="Relatórios">
      <FechamentoMesView />
    </AppShell>
  );
}
