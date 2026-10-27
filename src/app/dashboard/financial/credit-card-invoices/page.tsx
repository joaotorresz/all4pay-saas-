"use client";

import { AppShell } from "@/components/app/AppShell";
import { FaturaCartaoView } from "@/components/movimentacoes/CaixaViews";

/** Faturas do cartão — o ciclo de cada cartão cadastrado em Contas bancárias. */
export default function FaturasCartaoPage() {
  return (
    <AppShell title="Faturas do cartão" crumb="Caixa e bancos">
      <FaturaCartaoView />
    </AppShell>
  );
}
