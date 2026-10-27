"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { Secoes } from "@/components/app/Secoes";
import { DemonstrativoView } from "@/components/relatorios/DemonstrativoView";
import { FluxoCaixaMensalView } from "@/components/movimentacoes/CaixaViews";

/**
 * DFC — o caixa pela data de pagamento, em duas leituras do MESMO regime,
 * EMPILHADAS (27/10/2026, fim das abas internas): o demonstrativo do período
 * em cima e a planilha mês a mês embaixo. `?aba=mensal` rola até a planilha.
 */
export default function DFCPage() {
  return (
    <AppShell title="DFC" crumb="Relatórios">
      <Suspense fallback={null}>
        <Secoes
          secoes={[
            { id: "periodo", titulo: "Por período", desc: "O demonstrativo do caixa na janela escolhida.", conteudo: <DemonstrativoView tipo="dfc" /> },
            { id: "mensal", titulo: "Mês a mês", desc: "A planilha do caixa: saldo inicial, entradas, saídas e saldo final de cada mês.", conteudo: <FluxoCaixaMensalView /> },
          ]}
        />
      </Suspense>
    </AppShell>
  );
}
