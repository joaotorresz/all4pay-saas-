import { AppShell } from "@/components/app/AppShell";
import { EstruturaCadastrosView } from "@/components/registros/EstruturaCadastrosView";

export default function EstruturaCadastrosPage() {
  return (
    <AppShell title="Estrutura e cadastros" crumb="Configurações">
      <EstruturaCadastrosView />
    </AppShell>
  );
}
