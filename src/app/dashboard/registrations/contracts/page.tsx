import { AppShell } from "@/components/app/AppShell";
import { ContratosView } from "@/components/registros/ContratosView";

export default function ContratosPage() {
  return (
    <AppShell title="Contratos" crumb="Cadastros">
      <ContratosView />
    </AppShell>
  );
}
