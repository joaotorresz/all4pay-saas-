import { AppShell } from "@/components/app/AppShell";
import { NovaEmpresaForm } from "@/components/empresas/NovaEmpresaForm";

export default function NovaEmpresaPage() {
  return (
    <AppShell title="Nova Empresa" crumb="Empresas">
      <NovaEmpresaForm />
    </AppShell>
  );
}
