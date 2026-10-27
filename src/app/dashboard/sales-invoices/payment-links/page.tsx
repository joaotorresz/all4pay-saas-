"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { LinksPagamentoView } from "@/components/vendas-nf/OutrasViews";

/**
 * Links de pagamento. Era aba da tela Vendas, desativada a pedido do dono
 * (27/10/2026); voltou ao endereço próprio (`?novo=1` abre o formulário).
 */
export default function LinksPagamentoPage() {
  return (
    <AppShell title="Links de pagamento" crumb="Central de vendas">
      <Suspense fallback={null}>
        <LinksPagamentoView />
      </Suspense>
    </AppShell>
  );
}
