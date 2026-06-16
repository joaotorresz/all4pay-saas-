"use client";

import { AppShell } from "@/components/app/AppShell";
import { ContasView } from "@/components/contas/ContasView";
import { ConectarBanco } from "@/components/contas/ConectarBanco";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";

export default function ContasPage() {
  return (
    <AppShell
      title="Open Finance"
      crumb="Upload de dados · posição por banco"
      actions={
        <div className="flex items-center gap-3">
          {isDemo && <DemoBadge />}
          <ConectarBanco />
        </div>
      }
    >
      <ContasView />
    </AppShell>
  );
}
