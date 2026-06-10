import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { ImportView } from "@/components/import/ImportView";

export const metadata: Metadata = {
  title: "all4pay — Onboarding inteligente",
  description:
    "FDIP: ingestão de extratos (CSV/OFX), entendimento, resolução de entidades, descoberta de padrões, destino inteligente e setup automático da empresa.",
};

export default function ImportPage() {
  return (
    <AppShell
      title="Onboarding inteligente"
      crumb="Financial Data Ingestion & Intelligence"
      actions={isDemo ? <DemoBadge /> : null}
    >
      <ImportView />
    </AppShell>
  );
}
