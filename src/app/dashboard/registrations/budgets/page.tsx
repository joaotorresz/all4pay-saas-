import { AppShell } from "@/components/app/AppShell";
import { OrcamentosView } from "@/components/registros/OrcamentosView";

export default function OrcamentosPage() {
  return (
    <AppShell title="Orçamentos" crumb="Estrutura e cadastros">
      <OrcamentosView />
    </AppShell>
  );
}
