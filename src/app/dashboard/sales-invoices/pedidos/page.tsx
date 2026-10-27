"use client";

import { AppShell } from "@/components/app/AppShell";
import { VendasView } from "@/components/vendas-nf/VendasView";

/**
 * Pedidos de venda — a lista dos documentos de venda (editar, excluir, status
 * da nota). Era a aba Pedidos da tela Vendas, desativada a pedido do dono
 * (27/10/2026): o endereço `/dashboard/sales-invoices` abre o Painel de
 * vendas, e a lista mora aqui para a venda continuar editável.
 */
export default function PedidosDeVendaPage() {
  return (
    <AppShell title="Pedidos de venda" crumb="Central de vendas">
      <VendasView />
    </AppShell>
  );
}
