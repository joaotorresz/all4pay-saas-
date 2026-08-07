"use client";

import { AppShell } from "@/components/app/AppShell";
import { NfseView } from "@/components/nfse/NfseView";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";

export function NotasFiscaisLista() {
  return (
    <AppShell title="Notas fiscais (NFS-e)" crumb="Receber · obrigação fiscal" actions={isDemo ? <DemoBadge /> : undefined}>
      <NfseView />
    </AppShell>
  );
}
