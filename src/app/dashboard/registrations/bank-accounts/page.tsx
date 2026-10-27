"use client";

import { AppShell } from "@/components/app/AppShell";
import { ContasBancariasView } from "@/components/registros/ContasBancariasView";

/**
 * Contas bancárias — o cadastro das contas e cartões da empresa. Faturas do
 * cartão e transferências eram abas desta tela e viraram páginas próprias
 * (27/10/2026, "uma página, sem abas internas"); os `?aba=` antigos
 * respondem 308 para elas.
 */
export default function ContasBancariasPage() {
  return (
    <AppShell title="Contas bancárias" crumb="Caixa e bancos">
      <ContasBancariasView />
    </AppShell>
  );
}
