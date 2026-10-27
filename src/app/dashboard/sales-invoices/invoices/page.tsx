"use client";

import Link from "next/link";
import { AppShell } from "@/components/app/AppShell";
import { Icon, classesDoBotao } from "@/components/ui";
import { NotasFiscaisView } from "@/components/vendas-nf/OutrasViews";

/**
 * Notas fiscais — a lista das notas das VENDAS.
 *
 * ⚠️ O emissor de NFS-e avulsa era a segunda aba desta tela. Desde 27/10/2026
 * (decisão do dono, o fim das abas internas) emitir é uma AÇÃO, e ação é
 * botão: "Emitir NFS-e" no topo abre o emissor no endereço próprio
 * (`/dashboard/sales-invoices/invoices/nfse`).
 */
export default function NotasFiscaisPage() {
  return (
    <AppShell
      title="Notas fiscais"
      crumb="Central de vendas"
      actions={
        <Link href="/dashboard/sales-invoices/invoices/nfse" className={classesDoBotao("primary")}>
          <Icon name="plus" size={15} color="currentColor" />
          Emitir NFS-e
        </Link>
      }
    >
      <NotasFiscaisView />
    </AppShell>
  );
}
