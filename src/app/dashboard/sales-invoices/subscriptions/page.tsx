"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { HubShell, type AbaHub } from "@/components/app/HubShell";
import { AssinaturasVendasView } from "@/components/vendas-nf/OutrasViews";
import { RecorrenciasView } from "@/components/recorrencias/RecorrenciasView";
import { ContratosView } from "@/components/registros/ContratosView";

/**
 * Assinaturas — a porta ÚNICA para criar, ativar, pausar e cancelar.
 *
 * ⚠️ **Não havia como criar uma assinatura.** Esta tela era só a LISTA, e o
 * gerenciador (`RecorrenciasView`: criar, ativar — que lança as faturas
 * previstas —, pausar, cancelar, MRR) tinha ficado ÓRFÃO quando `/recorrencias`
 * virou desvio para cá: nenhuma rota o montava. O atalho "Nova assinatura" do
 * painel Criar abria o formulário de contrato, que em demonstração não grava
 * nada e responde "Contrato salvo". A lista dizia "as recorrências que você
 * ativar aparecem aqui" sem oferecer onde ativar.
 */
const ABAS: AbaHub[] = [
  { id: "contratos", label: "Contratos e MRR", render: () => <RecorrenciasView /> },
  { id: "lista", label: "Lista e exportação", render: () => <AssinaturasVendasView /> },
  // Os contratos de CLIENTE moram aqui; os de fornecedor, em Contas recorrentes.
  { id: "contratos-cliente", label: "Contratos de cliente", render: () => <ContratosView lado="cliente" /> },
];

export default function AssinaturasPage() {
  return (
    <AppShell title="Assinaturas e contratos" crumb="Central de vendas">
      <Suspense fallback={null}>
        <HubShell abas={ABAS} />
      </Suspense>
    </AppShell>
  );
}
