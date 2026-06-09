import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { CopilotoView } from "@/components/copiloto/CopilotoView";

export const metadata: Metadata = {
  title: "all4pay — Copiloto",
  description:
    "IA executiva: copiloto financeiro, briefing diário, insights priorizados, detecção de anomalias, motor preditivo e simulador de cenários.",
};

export default function CopilotoPage() {
  return (
    <AppShell
      title="Copiloto"
      crumb="IA executiva"
      actions={isDemo ? <DemoBadge /> : null}
    >
      <CopilotoView />
    </AppShell>
  );
}
