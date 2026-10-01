import { AppShell } from "@/components/app/AppShell";
import { AtalhosTela } from "@/components/app/AtalhosTela";
import { ContasBancariasView } from "@/components/registros/ContasBancariasView";

export default function ContasBancariasPage() {
  return (
    <AppShell title="Contas bancárias" crumb="Estrutura e cadastros">
      <div className="flex flex-col gap-5">
        {/* A fatura é do cartão cadastrado aqui — saiu do menu e mora a um clique. */}
        <AtalhosTela
          atalhos={[
            { label: "Fatura do cartão", href: "/dashboard/financial/credit-card-invoices", icon: "credit-card" },
            { label: "Transferências entre contas", href: "/dashboard/financial/accounts-and-transfers", icon: "repeat" },
          ]}
        />
        <ContasBancariasView />
      </div>
    </AppShell>
  );
}
