import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { InicioActions } from "@/components/visao-geral/InicioActions";
import { HomeProposta } from "@/components/visao-geral/HomeProposta";
import { PeriodProvider } from "@/components/visao-geral/PeriodContext";

export const metadata: Metadata = {
  title: "Visão geral · Quattro",
  description:
    "Visão geral: a receber, a pagar, contas financeiras, fluxo de caixa e vendas.",
};

export default function HomePage() {
  return (
    <PeriodProvider>
      <AppShell title="Página inicial" tituloAba="Visão geral" actions={<InicioActions demo={isDemo} />} scopeClassName="ds-visor" stickyHeader={false}>
        {/* ⚠️ A HOME DA PROPOSTA (canvas "Quattro · Home", out/2026): Fluxo de
            caixa + Saúde, Calendário + Distribuição, Operação e Transações
            recentes, numa grade de 12 colunas. Os valores voltam a mostrar os
            centavos, como o desenho aprovado. Ver `HomeProposta.tsx`. */}
        <HomeProposta />
      </AppShell>
    </PeriodProvider>
  );
}
