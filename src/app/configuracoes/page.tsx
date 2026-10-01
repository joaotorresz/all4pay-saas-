"use client";

import { Suspense, useMemo } from "react";
import { AppShell } from "@/components/app/AppShell";
import { HubShell, type AbaHub } from "@/components/app/HubShell";
import { ConfiguracoesView } from "@/components/configuracoes/ConfiguracoesView";
import { AutomacoesView } from "@/components/configuracoes/AutomacoesView";
import { useToast } from "@/components/listas/ListChrome";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { isDemo } from "@/lib/demo";

/**
 * Configurações da empresa — a porta "Meu perfil" do ⋮.
 *
 * ⚠️ As AUTOMAÇÕES (resumo do caixa, lembrete de contas a pagar, alerta de
 * caixa, fechamento e régua automática) entraram como ABA daqui, e não como
 * item novo de menu: "o que o sistema me manda e para quem" é configuração da
 * empresa, e uma pergunta pede uma tela (enxugamento do MVP, 30/09/2026).
 */
export default function ConfiguracoesPage() {
  const { show, node } = useToast();
  const abas: AbaHub[] = useMemo(() => [
    { id: "empresa", label: "Empresa", render: () => <ConfiguracoesView onToast={show} /> },
    { id: "automacoes", label: "Automações", render: () => <AutomacoesView /> },
  ], [show]);
  return (
    <AppShell title="Configurações da empresa" crumb="Empresa" actions={isDemo ? <DemoBadge /> : undefined}>
      <Suspense fallback={null}>
        <HubShell abas={abas} />
      </Suspense>
      {node}
    </AppShell>
  );
}
