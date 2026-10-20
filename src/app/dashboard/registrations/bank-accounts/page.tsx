"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { HubShell, type AbaHub } from "@/components/app/HubShell";
import { ContasBancariasView } from "@/components/registros/ContasBancariasView";
import { FaturaCartaoView } from "@/components/movimentacoes/CaixaViews";
import { TransferenciasView } from "@/components/movimentacoes/TransferenciasView";

/**
 * Contas e cartões — a conta, a fatura do cartão cadastrado nela e o dinheiro
 * que anda entre contas próprias, numa tela (reorganização dos menus,
 * 19/10/2026). Fatura e transferências eram rotas próprias; os endereços
 * antigos respondem 308 para a aba certa.
 */
const ABAS: AbaHub[] = [
  { id: "contas", label: "Contas", render: () => <ContasBancariasView /> },
  { id: "faturas", label: "Faturas do cartão", render: () => <FaturaCartaoView /> },
  { id: "transferencias", label: "Transferências", render: () => <TransferenciasView /> },
];

export default function ContasECartoesPage() {
  return (
    <AppShell title="Contas e cartões" crumb="Caixa e bancos">
      <Suspense fallback={null}>
        <HubShell abas={ABAS} />
      </Suspense>
    </AppShell>
  );
}
