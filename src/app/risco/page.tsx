import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { RiscoView } from "@/components/risco/RiscoView";

export const metadata: Metadata = {
  title: "all4pay — Risco de caixa",
  description: "Motor de risco operacional financeiro: score, runway, stress e interpretação executiva.",
};

export default function RiscoPage() {
  return (
    <AppShell
      title="Risco de caixa"
      crumb="Inteligência financeira"
      actions={isDemo ? <DemoBadge /> : null}
    >
      <RiscoView />
    </AppShell>
  );
}
