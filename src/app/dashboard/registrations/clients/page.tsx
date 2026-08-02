import { AppShell } from "@/components/app/AppShell";
import { PartesView } from "@/components/registros/PartesView";

export default function ClientesPage() {
  return (
    <AppShell title="Clientes" crumb="Cadastros">
      <PartesView lado="cliente" />
    </AppShell>
  );
}
