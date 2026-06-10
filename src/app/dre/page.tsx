import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { DREView } from "@/components/dre/DREView";

export const metadata: Metadata = {
  title: "all4pay — DRE",
  description:
    "DRE Intelligence Center: gerencial, financeiro, por cliente, por linha, comparativo, projetado e executivo — com drill-down, filtros e leitura por IA.",
};

export default function DREPage() {
  return (
    <AppShell
      title="DRE"
      crumb="DRE Intelligence Center"
      actions={isDemo ? <DemoBadge /> : null}
    >
      <DREView />
    </AppShell>
  );
}
