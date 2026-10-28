import { Suspense } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app/AppShell";
import { Icon, classesDoBotao } from "@/components/ui";
import { ReembolsosView } from "@/components/reembolsos/ReembolsosView";

/**
 * ⚠️ Rota PRÓPRIA criada ao portar o hub legado (mapa de consolidação, item 2).
 * Esta tela só existia como aba de `/recebimentos`/`/pagamentos`; aposentar o
 * hub sem lhe dar endereço a apagaria do produto, e ninguém notaria até alguém
 * procurá-la e não achar.
 *
 * 27/10/2026 (molde da Central de vendas): a ação no topo, os pedidos com o
 * filtro por situação e o formulário como seção — sem abas. "Novo reembolso"
 * rola até o formulário (`?aba=solicitar`).
 */
export default function Page() {
  return (
    <AppShell
      title="Reembolsos"
      crumb="Central de despesas"
      actions={
        <Link href="/dashboard/financial/reimbursements?aba=solicitar" className={classesDoBotao("primary")}>
          <Icon name="plus" size={15} color="currentColor" />
          Novo reembolso
        </Link>
      }
    >
      <Suspense fallback={null}>
        <ReembolsosView />
      </Suspense>
    </AppShell>
  );
}
