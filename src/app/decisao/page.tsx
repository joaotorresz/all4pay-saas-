import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { DecisaoView } from "@/components/decisao/DecisaoView";

export const metadata: Metadata = {
  title: "all4pay — Decisão",
  description:
    "Financial Decision Layer: feature store, matriz de risco probabilística, previsão Monte Carlo, recomendações com impacto simulado e ações autônomas.",
};

export default function DecisaoPage() {
  return (
    <AppShell
      title="Decisão"
      crumb="Financial Decision Layer"
      actions={isDemo ? <DemoBadge /> : null}
    >
      <DecisaoView />
    </AppShell>
  );
}
