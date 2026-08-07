"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { HubShell, type AbaHub } from "@/components/app/HubShell";
import {
  AssinaturaView, UsuariosView, LogsView, RelatoriosExportadosView,
} from "@/components/administracao/AdministracaoViews";
import { DadosEmpresaView } from "@/components/administracao/DadosEmpresaView";
import { IntegracoesView } from "@/components/administracao/IntegracoesView";

/**
 * Hub de Administração — as 6 telas de configuração num destino só. Cada uma
 * tem rota própria em /dashboard/administration/*, então deep-link e a command
 * palette continuam apontando direto para a tela.
 */
const ABAS: AbaHub[] = [
  { id: "assinatura", label: "Assinatura", render: () => <AssinaturaView /> },
  { id: "empresa", label: "Dados da empresa", render: () => <DadosEmpresaView /> },
  { id: "usuarios", label: "Usuários", render: () => <UsuariosView /> },
  { id: "logs", label: "Logs", render: () => <LogsView /> },
  { id: "integracoes", label: "Integrações", render: () => <IntegracoesView /> },
  { id: "exportados", label: "Relatórios exportados", render: () => <RelatoriosExportadosView /> },
];

export default function AdministracaoPage() {
  return (
    <AppShell title="Administração" crumb="Configurações">
      <Suspense fallback={null}>
        <HubShell abas={ABAS} />
      </Suspense>
    </AppShell>
  );
}
