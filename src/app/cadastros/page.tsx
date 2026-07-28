"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { HubShell, type AbaHub } from "@/components/app/HubShell";
import { ContatosLista } from "@/app/contatos/lista";
import { ProdutosLista } from "@/app/produtos/lista";
import { ServicosLista } from "@/app/servicos/lista";
import { ProjetosView } from "@/components/cadastros/ProjetosView";
import { CentrosCustoView } from "@/components/cadastros/CentrosCustoView";

/**
 * Hub de Cadastros — 5 telas de "quem/o quê" num destino só.
 *
 * As listas (Contatos/Produtos/Serviços) montam a tela inteira no próprio
 * `page.tsx`; como o `AppShell` detecta aninhamento e vira passthrough, dá para
 * reaproveitar a página como aba SEM refatorar nenhuma delas — o header e as
 * ações ("Novo produto") continuam vindo de lá, já corretos.
 */
const ABAS: AbaHub[] = [
  { id: "contatos", label: "Clientes & Fornecedores", render: () => <ContatosLista /> },
  { id: "produtos", label: "Produtos", render: () => <ProdutosLista /> },
  { id: "servicos", label: "Serviços", render: () => <ServicosLista /> },
  { id: "projetos", label: "Projetos", render: () => <ProjetosView /> },
  { id: "centros-custo", label: "Centros de custo", render: () => <CentrosCustoView /> },
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
