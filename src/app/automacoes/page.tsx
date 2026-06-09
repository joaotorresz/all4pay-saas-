"use client";

import { AppShell } from "@/components/app/AppShell";
import { AutomacoesView } from "@/components/financial-os/AutomacoesView";
import { useToast } from "@/components/listas/ListChrome";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { isDemo } from "@/lib/demo";

export default function AutomacoesPage() {
  const { show, node } = useToast();
  return (
    <AppShell
      title="Automações"
      crumb="Sistema operacional financeiro"
      actions={isDemo ? <DemoBadge /> : null}
    >
      <AutomacoesView onToast={show} />
      {node}
    </AppShell>
  );
}
