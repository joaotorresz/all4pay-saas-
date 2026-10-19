import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { IntegracoesView } from "@/components/administracao/IntegracoesView";

export default function Page() {
  return (
    <AppShell title="Integrações e API" crumb="Configurações">
      <Suspense fallback={null}>
        <IntegracoesView />
      </Suspense>
    </AppShell>
  );
}
