"use client";

import { Suspense } from "react";
import { Secoes } from "@/components/app/Secoes";
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
 * partes viraram seções do mesmo endereço, com o checklist PRIMEIRO. O
 * parâmetro é `painel`, não `aba`, porque esta tela também vive como aba dos
 * hubs de Contabilidade e de Relatórios, que já usam `aba`.
 */
/*
 * ⚠️ 27/10/2026 (fim das abas internas): as duas partes vêm EMPILHADAS, o
 * checklist em cima. `?painel=relatorio` rola até o relatório.
 */
export function FechamentoMesView() {
  return (
    <Suspense fallback={null}>
      <Secoes
        param="painel"
        secoes={[
          { id: "checklist", titulo: "Checklist e trava do período", desc: "Conferir, provisionar e travar o mês.", conteudo: <ChecklistFechamento /> },
          { id: "relatorio", titulo: "Relatório do mês", desc: "A narrativa do mês, redigida e assinada.", conteudo: <RelatorioFechamento /> },
        ]}
      />
    </Suspense>
  );
}
