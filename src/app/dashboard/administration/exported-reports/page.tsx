import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { RelatoriosExportadosView } from "@/components/administracao/AdministracaoViews";

export default function Page() {
  return (
    <AppShell title="Arquivos gerados" crumb="Configurações">
      <Suspense fallback={null}>
        <RelatoriosExportadosView />
      </Suspense>
    </AppShell>
  );
}
