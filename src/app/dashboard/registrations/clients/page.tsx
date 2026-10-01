import { AppShell } from "@/components/app/AppShell";
import { PartesView } from "@/components/registros/PartesView";

export default function ClientesPage() {
  return (
    <AppShell title="Clientes" crumb="Estrutura e cadastros">
      <PartesView lado="cliente" />
    </AppShell>
  );
}
