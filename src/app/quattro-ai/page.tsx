import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { Suspense } from "react";
import { AssistenteShell } from "@/components/ia/AssistenteShell";

export const metadata: Metadata = {
  title: "Quattro AI · Quattro",
  description:
    "O chat da Quattro AI em tela inteira: pergunte sobre seus números, com histórico de conversas, gráficos nas respostas e as fontes de cada cálculo.",
};

export default function QuattroAIPage() {
  return (
    <AppShell title="Quattro AI" actions={isDemo ? <DemoBadge /> : null}>
      <Suspense fallback={null}><AssistenteShell /></Suspense>
    </AppShell>
  );
}
