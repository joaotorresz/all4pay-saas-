import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { OverviewGrid } from "@/components/visao-geral/OverviewGrid";

export const metadata: Metadata = {
  title: "all4pay — Início",
  description:
    "Início: a receber, a pagar, contas financeiras, fluxo de caixa e vendas.",
};

export default function HomePage() {
  return (
    <AppShell title="Início" actions={isDemo ? <DemoBadge /> : null}>
      <OverviewGrid />
    </AppShell>
  );
}
