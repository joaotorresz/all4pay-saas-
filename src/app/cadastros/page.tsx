"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { HubShell, type AbaHub } from "@/components/app/HubShell";
import { ServicosLista } from "@/app/servicos/lista";
import { ContasBancariasView } from "@/components/registros/ContasBancariasView";
import { PlanoContasView } from "@/components/registros/PlanoContasView";
import { PartesView } from "@/components/registros/PartesView";
import { ProdutosRegistroView } from "@/components/registros/ProdutosRegistroView";
import { ProjetosRegistroView, CentrosCustoRegistroView } from "@/components/registros/ProjetosCentrosView";
import { ContratosView } from "@/components/registros/ContratosView";
import { OrcamentosView } from "@/components/registros/OrcamentosView";

/**
 * Hub de Cadastros — o "quem/o quê" do ERP num destino só.
 *
 * Cada aba tem rota própria em `/dashboard/registrations/*` e abre sozinha;
 * aqui viram abas para o menu não ganhar dez entradas. Clientes vem primeiro
 * porque é o cadastro que mais se abre no dia a dia.
 *
 * Clientes e Fornecedores eram uma aba só ("Contatos"); separá-los é o que
 * permite cada lado ter os campos que só ele tem — chave PIX e Dados PJ do
 * fornecedor, categoria padrão de receita do cliente.
 */
const ABAS: AbaHub[] = [
  { id: "clientes", label: "Clientes", render: () => <PartesView lado="cliente" /> },
  { id: "fornecedores", label: "Fornecedores", render: () => <PartesView lado="fornecedor" /> },
  { id: "produtos", label: "Produtos", render: () => <ProdutosRegistroView /> },
  { id: "servicos", label: "Serviços", render: () => <ServicosLista /> },
  { id: "contas", label: "Contas bancárias", render: () => <ContasBancariasView /> },
  { id: "plano", label: "Plano de contas", render: () => <PlanoContasView /> },
  { id: "centros-custo", label: "Centros de custo", render: () => <CentrosCustoRegistroView /> },
  { id: "projetos", label: "Projetos", render: () => <ProjetosRegistroView /> },
  { id: "contratos", label: "Contratos", render: () => <ContratosView /> },
  { id: "orcamento", label: "Orçamento", render: () => <OrcamentosView /> },
];

export default function CadastrosPage() {
  return (
    <AppShell title="Cadastros" crumb="Cadastros">
      <Suspense fallback={null}>
        <HubShell abas={ABAS} />
      </Suspense>
    </AppShell>
  );
}
