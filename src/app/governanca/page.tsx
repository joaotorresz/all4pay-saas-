import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { InstitutionalView } from "@/components/institucional/InstitutionalView";

export const metadata: Metadata = {
  title: "all4pay — Governança",
  description:
    "Camada institucional: trilha de auditoria imutável (hash-chain), permissões granulares (RBAC + policy engine) e fluxo de aprovação.",
};

export default function GovernancaPage() {
  return (
    <AppShell
      title="Governança"
      crumb="Camada institucional"
      actions={isDemo ? <DemoBadge /> : null}
    >
      <InstitutionalView />
    </AppShell>
  );
}
