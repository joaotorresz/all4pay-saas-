import { AppShell } from "@/components/app/AppShell";
import { FechamentoView } from "@/components/relatorios/FechamentoView";

export default function FechamentoMensalPage() {
  return (
    <AppShell title="Fechamento mensal" crumb="Relatórios">
      <FechamentoView />
    </AppShell>
  );
}
