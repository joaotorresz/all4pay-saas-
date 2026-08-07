import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { AjudaView } from "@/components/ajuda/AjudaView";

export default function AjudaPage() {
  return (
    <AppShell title="Central de ajuda" crumb="Ajuda">
      <Suspense fallback={null}>
        <AjudaView />
      </Suspense>
    </AppShell>
  );
}
