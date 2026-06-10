"use client";

import { AppShell } from "@/components/app/AppShell";
import { ConfiguracoesView } from "@/components/configuracoes/ConfiguracoesView";
import { useToast } from "@/components/listas/ListChrome";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { isDemo } from "@/lib/demo";

export default function ConfiguracoesPage() {
  const { show, node } = useToast();
  return (
    <AppShell title="Configurações" crumb="Empresa" actions={isDemo ? <DemoBadge /> : undefined}>
      <ConfiguracoesView onToast={show} />
      {node}
    </AppShell>
  );
}
