import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { LogsView } from "@/components/administracao/AdministracaoViews";

export default function Page() {
  return (
    <AppShell title="Logs" crumb="Administração">
      <Suspense fallback={null}>
        <LogsView />
      </Suspense>
    </AppShell>
  );
}
