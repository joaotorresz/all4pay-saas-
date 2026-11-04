"use client";

import Link from "next/link";
import { AppShell } from "@/components/app/AppShell";
import { Icon, classesDoBotao } from "@/components/ui";
import { ContasBancariasView } from "@/components/registros/ContasBancariasView";

/**
 * Contas bancárias — o cadastro das contas e cartões da empresa. Faturas do
 * cartão e transferências eram abas desta tela e viraram páginas próprias
 * (27/10/2026, "uma página, sem abas internas"); os `?aba=` antigos
 * respondem 308 para elas.
 *
 * ⚠️ Desde 03/11/2026 as duas saíram do menu (Caixa e bancos enxuto) e a porta
 * delas é aqui, nos botões do topo: são o movimento das contas desta tela.
 */
export default function ContasBancariasPage() {
  return (
    <AppShell
      title="Contas bancárias"
      crumb="Caixa e bancos"
      actions={
        <>
          <Link href="/dashboard/financial/credit-card-invoices" className={classesDoBotao("secondary")}>
            <Icon name="credit-card" size={15} color="currentColor" />
            Faturas do cartão
          </Link>
          <Link href="/dashboard/financial/transfers" className={classesDoBotao("secondary")}>
            <Icon name="arrow-left-right" size={15} color="currentColor" />
            Transferências
          </Link>
        </>
      }
    >
      <ContasBancariasView />
    </AppShell>
  );
}
