import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { InicioActions } from "@/components/visao-geral/InicioActions";
import { InicioTitle } from "@/components/visao-geral/InicioTitle";
import { OverviewGrid } from "@/components/visao-geral/OverviewGrid";
import { VisorHomeTop } from "@/components/visao-geral/VisorHomeTop";
import { PeriodProvider } from "@/components/visao-geral/PeriodContext";

export const metadata: Metadata = {
  title: "all4pay — Início",
  description:
    "Início: a receber, a pagar, contas financeiras, fluxo de caixa e vendas.",
};

export default function HomePage() {
  return (
    <PeriodProvider>
      {/* `a4p-sem-centavos`: na Home os valores aparecem arredondados (sem vírgula). */}
      <AppShell title={<InicioTitle />} actions={<InicioActions demo={isDemo} />} scopeClassName="ds-visor a4p-sem-centavos" stickyHeader={false}>
        <VisorHomeTop />
        <OverviewGrid />
      </AppShell>
    </PeriodProvider>
  );
}
