"use client";

import { AppShell } from "@/components/app/AppShell";
import { InboxView } from "@/components/inbox/InboxView";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";

export default function InboxPage() {
  return (
    <AppShell
      title="Caixa de Entrada Financeira"
      crumb="Inteligência financeira"
      actions={isDemo ? <DemoBadge /> : undefined}
    >
      <InboxView />
    </AppShell>
  );
}
