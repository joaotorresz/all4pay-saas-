"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { HubShell, type AbaHub } from "@/components/app/HubShell";
import { MoneyFunnel } from "@/components/visao-geral/MoneyFunnel";
import { RecorrenciasView } from "@/components/recorrencias/RecorrenciasView";
import { InadimplenciaView } from "@/components/inadimplencia/InadimplenciaView";
import { BoletosView } from "@/components/boletos/BoletosView";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";

/**
 * Hub RECEBER — o funil inteiro de entrada num destino só. A primeira aba é o
 * uso diário (títulos a receber), então continua a UM clique; as demais são o
 * que se abre de vez em quando.
 */
const ABAS: AbaHub[] = [
  { id: "titulos", label: "Extrato", render: () => <MoneyFunnel direction="entrada" /> },
  { id: "recorrencias", label: "Assinaturas / Recorrências", render: () => <RecorrenciasView /> },
  { id: "inadimplencia", label: "Inadimplência", render: () => <InadimplenciaView /> },
  { id: "boletos", label: "Boletos", render: () => <BoletosView /> },
];

export default function ReceberPage() {
  return (
    <AppShell title="Extrato de recebimentos" actions={isDemo ? <DemoBadge /> : undefined}>
      <Suspense fallback={null}><HubShell abas={ABAS} /></Suspense>
    </AppShell>
  );
}
