import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { InicioActions } from "@/components/visao-geral/InicioActions";
import { InicioTitle } from "@/components/visao-geral/InicioTitle";
import { HomeQuatro } from "@/components/visao-geral/HomeQuatro";
import { PeriodProvider } from "@/components/visao-geral/PeriodContext";

export const metadata: Metadata = {
  title: "Visão geral · all4pay",
  description:
    "Visão geral: a receber, a pagar, contas financeiras, fluxo de caixa e vendas.",
};

export default function HomePage() {
  return (
    <PeriodProvider>
      {/* `a4p-sem-centavos`: na Home os valores aparecem arredondados (sem vírgula). */}
      <AppShell title={<InicioTitle />} tituloAba="Visão geral" actions={<InicioActions demo={isDemo} />} scopeClassName="ds-visor a4p-sem-centavos" stickyHeader={false}>
        {/* ⚠️ A Home tem QUATRO cards e só eles: Resumo · Calendário de
            transações · Dicas all4pay · Transações recentes. O cockpit
            modular (`OverviewGrid`, ~94 widgets) e o topo antigo
            (`VisorHomeTop`) saíram daqui — a Home deixou de ser um painel
            que se monta e virou uma composição fixa. Os widgets continuam
            existindo nas telas que respondem por eles. */}
        <HomeQuatro />
      </AppShell>
    </PeriodProvider>
  );
}
