"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { HubShell, type AbaHub } from "@/components/app/HubShell";
import { RazaoView } from "@/components/razao/RazaoView";
import { FechamentoView } from "@/components/fechamento/FechamentoView";
import { ReceitaReconhecimentoView } from "@/components/receita/ReceitaView";
import { RelatoriosRazaoView } from "@/components/relatorios/RelatoriosRazaoView";
import { PlanoContasView } from "@/components/registros/PlanoContasView";
import { DimensoesView } from "@/components/dimensoes/DimensoesView";
import { CronogramasView } from "@/components/cronogramas/CronogramasView";
import { EnvioNFsView } from "@/components/contabilidade-export/EnvioNFsView";
import { DominioExportView } from "@/components/contabilidade-export/DominioExportView";
import { ConsolidadoView } from "@/components/consolidado/ConsolidadoView";

/**
 * Hub de Contabilidade — 10 telas irmãs viram 10 abas de UM destino de menu.
 * As rotas antigas (/razao, /fechamento, …) redirecionam para cá com ?aba=,
 * então nada quebra: links, favoritos e a command palette seguem funcionando.
 */
const ABAS: AbaHub[] = [
  { id: "razao", label: "Razão contábil", render: () => <RazaoView /> },
  { id: "fechamento", label: "Fechamento mensal", render: () => <FechamentoView /> },
  { id: "receita", label: "Reconhecimento de receita", render: () => <ReceitaReconhecimentoView /> },
  { id: "relatorios", label: "Relatórios", render: () => <RelatoriosRazaoView /> },
  { id: "plano-de-contas", label: "Plano de contas", render: () => <PlanoContasView /> },
  { id: "dimensoes", label: "Dimensões & tags", render: () => <DimensoesView /> },
  { id: "cronogramas", label: "Cronogramas", render: () => <CronogramasView /> },
  { id: "envio", label: "Envio das NFs", render: () => <EnvioNFsView /> },
  { id: "txt-dominio", label: "TXT Domínio", render: () => <DominioExportView /> },
  { id: "consolidado", label: "Consolidado", render: () => <ConsolidadoView /> },
];

export default function ContabilidadePage() {
  return (
    <AppShell title="Contabilidade" crumb="Contabilidade">
      <Suspense fallback={null}>
        <HubShell abas={ABAS} />
      </Suspense>
    </AppShell>
  );
}
