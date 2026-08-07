import { AppShell } from "@/components/app/AppShell";
import { CentrosCustoRegistroView } from "@/components/registros/ProjetosCentrosView";

export default function CentrosCustoRegistroPage() {
  return (
    <AppShell title="Centros de custo" crumb="Cadastros">
      <CentrosCustoRegistroView />
    </AppShell>
  );
}
