import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { InadimplenciaView } from "@/components/inadimplencia/InadimplenciaView";

export const metadata: Metadata = {
  title: "all4pay — Inadimplência",
  description:
    "Motor de inteligência de crédito: scoring comportamental, previsão de inadimplência, early warning e cobrança adaptativa.",
};

export default function InadimplenciaPage() {
  return (
    <AppShell
      title="Inadimplência"
      crumb="Inteligência de crédito"
      actions={isDemo ? <DemoBadge /> : null}
    >
      <InadimplenciaView />
    </AppShell>
  );
}
