"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { HubShell, type AbaHub } from "@/components/app/HubShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { PainelVendas } from "@/components/painel-vendas/PainelVendas";
import { VendasView } from "@/components/vendas-nf/VendasView";
import { BoletosView } from "@/components/boletos/BoletosView";
import { LinksPagamentoView } from "@/components/vendas-nf/OutrasViews";
import { PosVendaView } from "@/components/pos/PosVendaView";
import { CentralPosTaxasView } from "@/components/pos/CentralPosTaxasView";

/**
 * PAINEL DE VENDAS — o painel de contas a receber e os títulos a receber numa
 * tela só (pedido do dono, 20/10/2026). As duas telas antigas saíram em
 * 26/10/2026 e os endereços delas respondem 308 para cá.
 *
 * ⚠️ A tela "Vendas" saiu do menu (pedido do dono, 26/10/2026) e as cinco abas
 * dela vieram para cá: Pedidos, Boletos e PIX, Links de pagamento, Maquininha
 * e Taxas da maquininha. Nenhuma tinha outra porta; levar o endereço antigo só
 * ao painel as deixaria sem acesso. `/dashboard/sales-invoices?aba=…` responde
 * 308 para a aba equivalente daqui (`core/rotas/aliases`).
 */
const ABAS: AbaHub[] = [
  { id: "painel", label: "Painel", render: () => <PainelVendas /> },
  { id: "pedidos", label: "Pedidos", render: () => <VendasView /> },
  { id: "boletos", label: "Boletos e PIX", render: () => <BoletosView /> },
  { id: "links", label: "Links de pagamento", render: () => <LinksPagamentoView /> },
  { id: "maquininha", label: "Maquininha", render: () => <PosVendaView /> },
  { id: "taxas", label: "Taxas da maquininha", render: () => <CentralPosTaxasView /> },
];

export default function PainelDeVendasPage() {
  return (
    <AppShell title="Painel de vendas" crumb="Central de vendas" actions={isDemo ? <DemoBadge /> : null}>
      <Suspense fallback={null}>
        <HubShell abas={ABAS} />
      </Suspense>
    </AppShell>
  );
}
