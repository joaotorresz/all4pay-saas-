"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { HubShell, type AbaHub } from "@/components/app/HubShell";
import { MoneyFunnel } from "@/components/visao-geral/MoneyFunnel";
import { ReembolsosView } from "@/components/reembolsos/ReembolsosView";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";

/** Hub PAGAR — títulos a pagar (uso diário, 1ª aba) + reembolsos. */
const ABAS: AbaHub[] = [
  { id: "titulos", label: "Contas a pagar", render: () => <MoneyFunnel direction="saida" /> },
  { id: "reembolsos", label: "Reembolsos", render: () => <ReembolsosView /> },
];

export default function PagarPage() {
  return (
    <AppShell title="Extrato de pagamentos" actions={isDemo ? <DemoBadge /> : undefined}>
      <Suspense fallback={null}><HubShell abas={ABAS} /></Suspense>
    </AppShell>
  );
}
