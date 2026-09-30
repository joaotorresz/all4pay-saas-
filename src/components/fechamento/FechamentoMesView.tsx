"use client";

import { Suspense } from "react";
import { HubShell, type AbaHub } from "@/components/app/HubShell";
import { FechamentoView as ChecklistFechamento } from "@/components/fechamento/FechamentoView";
import { FechamentoView as RelatorioFechamento } from "@/components/relatorios/FechamentoView";

/**
 * O FECHAMENTO DO MÊS — uma tela, duas partes, na ordem em que acontecem.
 *
 * ⚠️ Existiam dois componentes chamados `FechamentoView`, em dois menus: o
 * CHECKLIST (tarefas, provisões e a trava do período, no hub de Contabilidade)
 * e o RELATÓRIO assinado (a narrativa do mês, em Relatórios). O item de menu
 * "Fechar e travar o mês" levava ao relatório — que não fecha nem trava nada.
 *
 * Fechar é um processo só: conferir e travar, depois redigir e assinar. As duas
 * partes viraram painéis do mesmo endereço, com o checklist PRIMEIRO. O
 * parâmetro é `painel`, não `aba`, porque esta tela também vive como aba dos
 * hubs de Contabilidade e de Relatórios, que já usam `aba`.
 */
const PAINEIS: AbaHub[] = [
  { id: "checklist", label: "Checklist e trava do período", render: () => <ChecklistFechamento /> },
  { id: "relatorio", label: "Relatório do mês", render: () => <RelatorioFechamento /> },
];

export function FechamentoMesView() {
  return (
    <Suspense fallback={null}>
      <HubShell abas={PAINEIS} param="painel" />
    </Suspense>
  );
}
