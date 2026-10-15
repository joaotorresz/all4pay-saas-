import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { HomeSnapshot } from "@/components/visao-geral/HomeSnapshot";
import { PeriodProvider } from "@/components/visao-geral/PeriodContext";

export const metadata: Metadata = {
  title: "Visão geral · Quattro",
  description:
    "Visão geral: caixa, receita recorrente, burn, runway, contas a pagar e a receber, e o que precisa de ação.",
};

export default function HomePage() {
  return (
    <PeriodProvider>
      <AppShell title="Página inicial" tituloAba="Visão geral" scopeClassName="ds-visor" stickyHeader={false} semCabecalho>
        {/* ⚠️ A HOME DO CANVAS (prancheta "Home · proposta snapshot", 14/10/2026):
            caixa da Quattro AI, "Seu dashboard" e as três colunas de operação.
            Ver `HomeSnapshot.tsx` e `core/home/snapshot.ts`. */}
        <HomeSnapshot />
      </AppShell>
    </PeriodProvider>
  );
}
