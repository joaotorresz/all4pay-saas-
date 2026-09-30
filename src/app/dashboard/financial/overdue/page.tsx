"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { HubShell, type AbaHub } from "@/components/app/HubShell";
import { InadimplenciaView } from "@/components/inadimplencia/InadimplenciaView";
import { ReguaCobrancaView } from "@/components/inadimplencia/ReguaCobrancaView";

/**
 * Inadimplência e cobrança — QUEM está atrasado (risco por cliente) e O QUE
 * FAZER com cada um hoje (a régua de cobrança).
 *
 * ⚠️ Rota PRÓPRIA criada ao portar o hub legado (mapa de consolidação, item 2).
 * A régua entrou como painel desta tela, e não como tela nova, porque é o passo
 * seguinte da mesma pergunta: saber que o cliente atrasou e não ter onde agir
 * obriga a atravessar o produto no meio da tarefa.
 */
const PAINEIS: AbaHub[] = [
  { id: "regua", label: "Régua de cobrança", render: () => <ReguaCobrancaView /> },
  { id: "risco", label: "Risco por cliente", render: () => <InadimplenciaView /> },
];

export default function Page() {
  return (
    <AppShell title="Inadimplência e cobrança" crumb="Financeiro">
      <Suspense fallback={null}>
        <HubShell abas={PAINEIS} param="painel" />
      </Suspense>
    </AppShell>
  );
}
