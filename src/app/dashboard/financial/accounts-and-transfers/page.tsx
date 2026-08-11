"use client";

/**
 * TRANSFERÊNCIAS ENTRE CONTAS — o que sobrou deste hub, e de propósito.
 *
 * ⚠️ Ele tinha três abas: títulos a receber, títulos a pagar e transferências.
 * As duas primeiras ganharam tela própria (`/contas-a-receber/titulos` e
 * `/contas-a-pagar/titulos`) e as abas viraram DESVIO em `ALIASES_DE_ABA` — o
 * middleware resolve os endereços antigos com 308, então favorito e link
 * antigos continuam chegando ao lugar certo.
 *
 * Manter as abas aqui deixaria a mesma lista de títulos em dois endereços, com
 * uma das portas fora do menu e por isso invisível na revisão. É o defeito que
 * a ONDA 6 mediu 33 vezes, e a única razão de ele ter sobrevivido tanto tempo
 * neste hub é que ninguém navegava até a aba.
 */
import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { TransferenciasView } from "@/components/movimentacoes/TransferenciasView";

export default function TransferenciasPage() {
  return (
    <AppShell title="Transferências entre contas" crumb="Caixa e bancos">
      <Suspense fallback={null}>
        <TransferenciasView />
      </Suspense>
    </AppShell>
  );
}
