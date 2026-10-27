import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { CobrancaAutomaticaView } from "@/components/cobranca/CobrancaAutomaticaView";

export default function CobrancaAutomaticaPage() {
  return (
    <AppShell title="Cobrança automática" crumb="Central de vendas" actions={isDemo ? <DemoBadge /> : null}>
      <Suspense fallback={null}>
        <CobrancaAutomaticaView />
      </Suspense>
    </AppShell>
  );
}
