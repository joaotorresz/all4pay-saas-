import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { PainelDespesas } from "@/components/painel-despesas/PainelDespesas";

/**
 * PAINEL DE DESPESAS — o espelho do Painel de vendas (pedido do dono,
 * 27/10/2026): o painel de contas a pagar, os títulos a pagar e as compras numa
 * tela só. Os endereços antigos respondem 308 para cá.
 */
export default function PainelDeDespesasPage() {
  return (
    <AppShell title="Painel de despesas" crumb="Central de despesas" actions={isDemo ? <DemoBadge /> : null}>
      <Suspense fallback={null}>
        <PainelDespesas />
      </Suspense>
    </AppShell>
  );
}
