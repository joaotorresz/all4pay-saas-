import { AppShell } from "@/components/app/AppShell";
import { AtalhosTela } from "@/components/app/AtalhosTela";
import { VendasView } from "@/components/vendas-nf/VendasView";

export default function VendasPage() {
  return (
    <AppShell title="Painel de vendas" crumb="Vendas e NFs">
      <div className="flex flex-col gap-5">
        {/* As formas de COBRAR a venda saíram do menu e moram aqui, a um clique. */}
        <AtalhosTela
          rotulo="Cobrar e vender"
          atalhos={[
            { label: "Nova venda", href: "/dashboard/sales-invoices/new", icon: "plus" },
            { label: "Boletos e PIX", href: "/dashboard/financial/boletos", icon: "file-text" },
            { label: "Links de pagamento", href: "/dashboard/sales-invoices/payment-links", icon: "link" },
            { label: "Maquininha (POS)", href: "/pos/venda", icon: "credit-card" },
            { label: "Taxas da maquininha", href: "/pos/taxas", icon: "credit-card" },
          ]}
        />
        <VendasView />
      </div>
    </AppShell>
  );
}
