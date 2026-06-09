import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { OrquestracaoView } from "@/components/orquestracao/OrquestracaoView";

export const metadata: Metadata = {
  title: "all4pay — Orquestração",
  description:
    "Financial Operating System: toda ação vira evento e propaga pela cascata — Event Store, Ledger de dupla partida, State Engine, decisão/IA, auditoria, antifraude e grafo financeiro.",
};

export default function OrquestracaoPage() {
  return (
    <AppShell
      title="Orquestração"
      crumb="Financial Operating System"
      actions={isDemo ? <DemoBadge /> : null}
    >
      <OrquestracaoView />
    </AppShell>
  );
}
