"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { HubShell, type AbaHub } from "@/components/app/HubShell";
import { VendasView } from "@/components/vendas-nf/VendasView";
import { BoletosView } from "@/components/boletos/BoletosView";
import { LinksPagamentoView } from "@/components/vendas-nf/OutrasViews";
import { PosVendaView } from "@/components/pos/PosVendaView";
import { CentralPosTaxasView } from "@/components/pos/CentralPosTaxasView";

/**
 * Vendas — o pedido e as formas de COBRÁ-lo, numa tela só (reorganização dos
 * menus, 19/10/2026). Boletos e PIX, links de pagamento, a maquininha e as
 * taxas dela eram quatro rotas soltas a um atalho daqui; viraram abas, e os
 * endereços antigos respondem 308 para a aba certa (`core/rotas/aliases`).
 */
const ABAS: AbaHub[] = [
  { id: "pedidos", label: "Pedidos", render: () => <VendasView /> },
  { id: "boletos", label: "Boletos e PIX", render: () => <BoletosView /> },
  { id: "links", label: "Links de pagamento", render: () => <LinksPagamentoView /> },
  { id: "maquininha", label: "Maquininha", render: () => <PosVendaView /> },
  { id: "taxas", label: "Taxas da maquininha", render: () => <CentralPosTaxasView /> },
];

export default function VendasPage() {
  return (
    <AppShell title="Vendas" crumb="Central de vendas">
      <Suspense fallback={null}>
        <HubShell abas={ABAS} />
      </Suspense>
    </AppShell>
  );
}
