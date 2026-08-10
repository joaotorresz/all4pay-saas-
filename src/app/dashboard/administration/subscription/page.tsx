import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { AssinaturaView } from "@/components/administracao/AdministracaoViews";

export default function Page() {
  return (
    <AppShell title="Assinatura e plano" crumb="Administração">
      <Suspense fallback={null}>
        <AssinaturaView />
      </Suspense>
    </AppShell>
  );
}
