"use client";

import { AppShell } from "@/components/app/AppShell";
import { ConfiguracoesView } from "@/components/configuracoes/ConfiguracoesView";
import { useToast } from "@/components/listas/ListChrome";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { isDemo } from "@/lib/demo";

/* "Meu perfil" (o ⋮). A aba de Automações foi para Inteligência › Automações
   (19/10/2026): alerta da empresa não é dado da pessoa. */
export default function ConfiguracoesPage() {
  const { show, node } = useToast();
  return (
    <AppShell title="Meu perfil" crumb="Configurações" actions={isDemo ? <DemoBadge /> : undefined}>
      <ConfiguracoesView onToast={show} />
      {node}
    </AppShell>
  );
}
