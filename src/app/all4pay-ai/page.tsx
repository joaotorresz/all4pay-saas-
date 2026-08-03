import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { IAView } from "@/components/ia/IAView";

export const metadata: Metadata = {
  title: "All 4 Pay AI · all4pay",
  description:
    "O chat da All 4 Pay AI em tela inteira: pergunte sobre seus números, com histórico de conversas, gráficos nas respostas e as fontes de cada cálculo.",
};

export default function All4PayAIPage() {
  return (
    <AppShell title="All 4 Pay AI" actions={isDemo ? <DemoBadge /> : null}>
      <IAView />
    </AppShell>
  );
}
