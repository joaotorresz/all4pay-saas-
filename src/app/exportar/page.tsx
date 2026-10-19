"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { HubShell, type AbaHub } from "@/components/app/HubShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { ExportarView } from "@/components/exportar/ExportarView";
import { DominioExportView } from "@/components/contabilidade-export/DominioExportView";
import { EnvioNFsView } from "@/components/contabilidade-export/EnvioNFsView";

/**
 * Enviar ao contador — tudo que SAI para o escritório, numa tela
 * (reorganização dos menus, 19/10/2026): razão e DRE em planilha, o TXT do
 * Domínio e o pacote mensal das NFs. Eram três rotas, e duas delas também
 * eram abas do Razão.
 */
const ABAS: AbaHub[] = [
  { id: "razao-dre", label: "Razão e DRE", render: () => <ExportarView /> },
  { id: "dominio", label: "TXT Domínio", render: () => <DominioExportView /> },
  { id: "nfs", label: "Envio das NFs", render: () => <EnvioNFsView /> },
];

export default function EnviarAoContadorPage() {
  return (
    <AppShell title="Enviar ao contador" crumb="Contabilidade" actions={isDemo ? <DemoBadge /> : null}>
      <Suspense fallback={null}>
        <HubShell abas={ABAS} />
      </Suspense>
    </AppShell>
  );
}
