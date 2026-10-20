"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { HubShell, type AbaHub } from "@/components/app/HubShell";
import { MultiempresaView } from "@/components/relatorios/MultiempresaView";
import { ConsolidadoView } from "@/components/consolidado/ConsolidadoView";

/**
 * Multiempresas — o grupo inteiro numa tela (reorganização dos menus,
 * 19/10/2026): DRE, DFC e a posição consolidada. Eram três rotas (uma delas
 * aba do Razão).
 *
 * ⚠️ A posição consolidada continua Pro (`ABAS_PRO`), como era no Razão.
 */
const ABAS: AbaHub[] = [
  { id: "dre", label: "DRE", render: () => <MultiempresaView tipo="dre" /> },
  { id: "dfc", label: "DFC", render: () => <MultiempresaView tipo="dfc" /> },
  { id: "consolidado", label: "Posição consolidada", render: () => <ConsolidadoView /> },
];

export default function MultiempresasPage() {
  return (
    <AppShell title="Multiempresas" crumb="Relatórios">
      <Suspense fallback={null}>
        <HubShell abas={ABAS} />
      </Suspense>
    </AppShell>
  );
}
