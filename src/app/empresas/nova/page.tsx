import { AppShell } from "@/components/app/AppShell";
import { NovaEmpresaForm } from "@/components/empresas/NovaEmpresaForm";

export default function NovaEmpresaPage() {
  return (
    <AppShell title="Nova empresa" crumb="Empresas">
      <NovaEmpresaForm />
    </AppShell>
  );
}
