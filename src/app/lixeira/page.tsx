"use client";

import { AppShell } from "@/components/app/AppShell";
import { LixeiraView } from "@/components/lixeira/LixeiraView";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";

export default function LixeiraPage() {
  return (
    <AppShell
      title="Lixeira"
      crumb="Lançamentos cancelados · recuperáveis"
      actions={isDemo ? <DemoBadge /> : undefined}
    >
      <LixeiraView />
    </AppShell>
  );
}
