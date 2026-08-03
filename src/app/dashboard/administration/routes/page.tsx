import { AppShell } from "@/components/app/AppShell";
import { InventarioRotasView } from "@/components/administracao/InventarioRotasView";

export default function Page() {
  return (
    <AppShell title="Inventário de rotas" crumb="Administração">
      <InventarioRotasView />
    </AppShell>
  );
}
