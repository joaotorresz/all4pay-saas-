import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { PlataformaShell } from "@/components/plataforma/PlataformaShell";

export const metadata: Metadata = {
  title: "all4pay — Plataforma",
  description:
    "Plataforma financeira em um hub: Arquitetura institucional (10 camadas, Treasury Core, reliability), Infraestrutura (Double-Entry Ledger Core, Payment Orchestrator, idempotência) e Orquestração event-driven (Event Store, Ledger, State Engine) — em abas.",
};

export default function PlataformaPage() {
  return (
    <AppShell
      title="Plataforma"
      crumb="Financial platform"
      actions={isDemo ? <DemoBadge /> : null}
    >
      <Suspense fallback={null}>
        <PlataformaShell />
      </Suspense>
    </AppShell>
  );
}
