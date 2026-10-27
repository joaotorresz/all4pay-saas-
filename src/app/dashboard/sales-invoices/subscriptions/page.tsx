"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { Secoes, type Secao } from "@/components/app/Secoes";
import { AssinaturasVendasView } from "@/components/vendas-nf/OutrasViews";
import { RecorrenciasView } from "@/components/recorrencias/RecorrenciasView";
import { ContratosView } from "@/components/registros/ContratosView";

/**
 * Assinaturas — a porta ÚNICA para criar, ativar, pausar e cancelar.
 *
 * ⚠️ **Não havia como criar uma assinatura.** Esta tela era só a LISTA, e o
 * gerenciador (`RecorrenciasView`: criar, ativar — que lança as faturas
 * previstas —, pausar, cancelar, MRR) tinha ficado ÓRFÃO quando `/recorrencias`
 * virou desvio para cá: nenhuma rota o montava.
 *
 * ⚠️ 27/10/2026 (o fim das abas internas): as três partes são seções da mesma
 * página — MRR e contratos em cima, a lista para exportar e os contratos de
 * cliente embaixo. `?aba=lista` e `?aba=contratos-cliente` rolam até elas.
 */
const SECOES: Secao[] = [
  { id: "contratos", titulo: "Contratos e MRR", desc: "Receita recorrente, churn e as próximas faturas", conteudo: <RecorrenciasView /> },
  { id: "lista", titulo: "Lista e exportação", desc: "Todas as assinaturas, para filtrar e baixar", conteudo: <AssinaturasVendasView /> },
  // Os contratos de CLIENTE moram aqui; os de fornecedor, em Contas recorrentes.
  { id: "contratos-cliente", titulo: "Contratos de cliente", desc: "Vigência, rateio e as vendas que cada contrato gera", conteudo: <ContratosView lado="cliente" /> },
];

export default function AssinaturasPage() {
  return (
    <AppShell title="Assinaturas e contratos" crumb="Central de vendas">
      <Suspense fallback={null}>
        <Secoes secoes={SECOES} />
      </Suspense>
    </AppShell>
  );
}
