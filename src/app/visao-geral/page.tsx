import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { ReceivablesCard } from "@/components/visao-geral/ReceivablesCard";
import { PayablesCard } from "@/components/visao-geral/PayablesCard";
import { AccountsCard } from "@/components/visao-geral/AccountsCard";
import { DailyCashflowChart } from "@/components/visao-geral/DailyCashflowChart";
import { SalesChart } from "@/components/visao-geral/SalesChart";

export const metadata: Metadata = {
  title: "all4pay — Visão Geral",
  description: "Dashboard financeiro: a receber, a pagar, contas, fluxo de caixa e vendas.",
};

export default function VisaoGeralPage() {
  return (
    <AppShell title="Visão Geral" actions={isDemo ? <DemoBadge /> : null}>
      {/* Responsivo: 2 colunas no desktop, empilhado no mobile. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
        <ReceivablesCard />
        <PayablesCard />

        {/* Contas ocupa as duas colunas no desktop */}
        <div className="md:col-span-2">
          <AccountsCard />
        </div>

        <DailyCashflowChart />
        <SalesChart />
      </div>
    </AppShell>
  );
}
