"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { TransferenciasView } from "@/components/movimentacoes/TransferenciasView";

/** Transferências — o dinheiro que anda entre contas próprias (um fato, dois lados). */
export default function TransferenciasPage() {
  return (
    <AppShell title="Transferências" crumb="Caixa e bancos">
      <Suspense fallback={null}>
        <TransferenciasView />
      </Suspense>
    </AppShell>
  );
}
