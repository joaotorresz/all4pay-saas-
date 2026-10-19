"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { HubShell, type AbaHub } from "@/components/app/HubShell";
import { RazaoView } from "@/components/razao/RazaoView";
import { ReceitaReconhecimentoView } from "@/components/receita/ReceitaView";
import { DimensoesView } from "@/components/dimensoes/DimensoesView";
import { RelatoriosRazaoView } from "@/components/relatorios/RelatoriosRazaoView";
import { CronogramasView } from "@/components/cronogramas/CronogramasView";

/**
 * Hub de Contabilidade — telas irmãs viram abas de UM destino de menu.
 * As rotas antigas (/razao, /receita, …) redirecionam para cá com ?aba=,
 * então nada quebra: links, favoritos e a command palette seguem funcionando.
 *
 * ⚠️ Fechamento mensal e Plano de contas SAÍRAM daqui: cada um já tem a sua
 * tela canônica (`/dashboard/reports/monthly-closing` e
 * `/dashboard/registrations/chart-of-accounts`), e a aba era um segundo
 * endereço para a mesma tela. Os endereços das abas desviam para elas
 * (`ALIASES_DE_ABA`).
 */
/**
 * O Razão e o que é dele (reorganização dos menus, 19/10/2026). Relatórios do
 * razão, envio das NFs, TXT Domínio e consolidado saíram: o DRE e o balanço
 * moram em Relatórios, os arquivos do contador em "Enviar ao contador", o
 * consolidado em Multiempresas — e o pivot por dimensão veio para Dimensões.
 */
const ABAS: AbaHub[] = [
  { id: "razao", label: "Lançamentos", render: () => <RazaoView /> },
  { id: "receita", label: "Reconhecimento de receita", render: () => <ReceitaReconhecimentoView /> },
  { id: "cronogramas", label: "Cronogramas", render: () => <CronogramasView /> },
  {
    id: "dimensoes", label: "Dimensões",
    render: () => (
      <div className="flex flex-col gap-5">
        <DimensoesView />
        <RelatoriosRazaoView soPivot />
      </div>
    ),
  },
];

export default function ContabilidadePage() {
  return (
    <AppShell title="Razão contábil" crumb="Contabilidade">
      <Suspense fallback={null}>
        <HubShell abas={ABAS} />
      </Suspense>
    </AppShell>
  );
}
