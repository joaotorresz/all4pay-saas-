import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { InfraestruturaView } from "@/components/infraestrutura/InfraestruturaView";

export const metadata: Metadata = {
  title: "all4pay — Infraestrutura",
  description:
    "Financial infrastructure: Domain Architecture, Double-Entry Ledger Core (saldo derivado), Payment Orchestrator, fila com retry, idempotência e observabilidade financeira.",
};

export default function InfraestruturaPage() {
  return (
    <AppShell
      title="Infraestrutura"
      crumb="Financial infrastructure"
      actions={isDemo ? <DemoBadge /> : null}
    >
      <InfraestruturaView />
    </AppShell>
  );
}
