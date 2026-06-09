import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { DadosView } from "@/components/dados/DadosView";

export const metadata: Metadata = {
  title: "all4pay — Inteligência de dados",
  description:
    "Financial Data Moat: DNA financeiro, benchmark cross-tenant, modelos comportamentais, credit intelligence e modelo proprietário auto-aprendiz.",
};

export default function DadosPage() {
  return (
    <AppShell
      title="Inteligência de dados"
      crumb="Financial Data Moat"
      actions={isDemo ? <DemoBadge /> : null}
    >
      <DadosView />
    </AppShell>
  );
}
