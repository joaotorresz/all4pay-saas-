"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { HubShell, type AbaHub } from "@/components/app/HubShell";
import { AutomacoesFluxosView } from "@/components/automacoes/AutomacoesFluxosView";
import { AutomacoesView } from "@/components/configuracoes/AutomacoesView";

/**
 * Automações — as mensagens que a empresa agenda e os alertas que o sistema
 * dispara, num lugar só (reorganização dos menus, 19/10/2026). Os alertas
 * eram uma aba de "Meu perfil", onde ninguém os procurava.
 */
const ABAS: AbaHub[] = [
  { id: "mensagens", label: "Mensagens no WhatsApp", render: () => <AutomacoesFluxosView /> },
  { id: "alertas", label: "Alertas do sistema", render: () => <AutomacoesView /> },
];

export default function AutomacoesPage() {
  return (
    <AppShell title="Automações" crumb="Inteligência">
      <Suspense fallback={null}>
        <HubShell abas={ABAS} />
      </Suspense>
    </AppShell>
  );
}
