"use client";

/**
 * Hub de Relatórios — DRE, DFC, balanço, variação e as versões multiempresa.
 * Cada um mantém rota própria em `/dashboard/reports/*`; aqui são abas para o
 * menu não ganhar cinco entradas.
 *
 * ⚠️ O fechamento mensal saiu das abas: ele é a tela
 * `/dashboard/reports/monthly-closing`, e a aba era o terceiro endereço da
 * mesma tela. `?aba=fechamento` desvia para ela (`ALIASES_DE_ABA`).
 */
import * as React from "react";
import { AppShell } from "@/components/app/AppShell";
import { HubShell, type AbaHub } from "@/components/app/HubShell";
import { DemonstrativoView } from "@/components/relatorios/DemonstrativoView";
import { MultiempresaView } from "@/components/relatorios/MultiempresaView";
import { BalancoPatrimonialView } from "@/components/relatorios/BalancoPatrimonialView";
import { VariacaoView } from "@/components/relatorios/VariacaoView";

const ABAS: AbaHub[] = [
  { id: "dre", label: "DRE", render: () => <DemonstrativoView tipo="dre" /> },
  { id: "dfc", label: "DFC", render: () => <DemonstrativoView tipo="dfc" /> },
  { id: "balanco", label: "Balanço patrimonial", render: () => <BalancoPatrimonialView /> },
  { id: "variacao", label: "Análise de variação", render: () => <VariacaoView /> },
  { id: "dre-multi", label: "DRE Multiempresas", render: () => <MultiempresaView tipo="dre" /> },
  { id: "dfc-multi", label: "DFC Multiempresas", render: () => <MultiempresaView tipo="dfc" /> },
];

export default function RelatoriosHubPage() {
  return (
    <AppShell title="Relatórios" crumb="Relatórios">
      <React.Suspense fallback={null}>
        <HubShell abas={ABAS} />
      </React.Suspense>
    </AppShell>
  );
}
