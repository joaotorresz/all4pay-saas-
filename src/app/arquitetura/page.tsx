import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { ArquiteturaView } from "@/components/arquitetura/ArquiteturaView";

export const metadata: Metadata = {
  title: "all4pay — Arquitetura",
  description:
    "Institutional Financial Architecture: 10 camadas, serviços distribuídos, pipeline tempo real, Treasury Core, reliability layer, observabilidade e multi-tenant.",
};

export default function ArquiteturaPage() {
  return (
    <AppShell
      title="Arquitetura"
      crumb="Institutional Financial Architecture"
      actions={isDemo ? <DemoBadge /> : null}
    >
      <ArquiteturaView />
    </AppShell>
  );
}
