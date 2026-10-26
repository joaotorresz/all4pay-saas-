import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { PainelVendas } from "@/components/painel-vendas/PainelVendas";

/**
 * PAINEL DE VENDAS — o painel de contas a receber e os títulos a receber numa
 * tela só (pedido do dono, 20/10/2026). As duas telas antigas saíram em
 * 26/10/2026 e os endereços delas respondem 308 para cá.
 */
export default function PainelDeVendasPage() {
  return (
    <AppShell title="Painel de vendas" crumb="Central de vendas" actions={isDemo ? <DemoBadge /> : null}>
      <Suspense fallback={null}>
        <PainelVendas />
      </Suspense>
    </AppShell>
  );
}
