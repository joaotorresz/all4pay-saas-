"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { HubShell, type AbaHub } from "@/components/app/HubShell";
import { NotasFiscaisView } from "@/components/vendas-nf/OutrasViews";
import { NfseView } from "@/components/nfse/NfseView";

/**
 * Notas fiscais — UMA porta para as duas faces da nota.
 *
 * ⚠️ Eram duas telas em dois menus: a lista das notas das VENDAS (aqui) e o
 * emissor de NFS-e avulsa (aba do hub `/vendas`, aposentado). A pessoa que
 * procurava "notas fiscais" achava uma e não sabia que a outra existia. As
 * duas continuam, lado a lado, como abas do mesmo endereço.
 */
const ABAS: AbaHub[] = [
  { id: "vendas", label: "Notas das vendas", render: () => <NotasFiscaisView /> },
  { id: "nfse", label: "Emitir NFS-e", render: () => <NfseView /> },
];

export default function NotasFiscaisPage() {
  return (
    <AppShell title="Notas fiscais emitidas" crumb="Vendas e NFs">
      <Suspense fallback={null}>
        <HubShell abas={ABAS} />
      </Suspense>
    </AppShell>
  );
}
