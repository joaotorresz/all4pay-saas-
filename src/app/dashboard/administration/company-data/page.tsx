import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { DadosEmpresaView } from "@/components/administracao/DadosEmpresaView";

export default function Page() {
  return (
    <AppShell title="Dados da empresa" crumb="Administração">
      <Suspense fallback={null}>
        <DadosEmpresaView />
      </Suspense>
    </AppShell>
  );
}
