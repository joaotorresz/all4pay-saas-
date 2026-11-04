import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { Suspense } from "react";
import { AssistenteShell } from "@/components/ia/AssistenteShell";

export const metadata: Metadata = {
  title: "Quattro AI · Quattro",
  description:
    "O chat da Quattro AI em tela inteira: pergunte sobre seus números, com histórico de conversas, gráficos nas respostas e as fontes de cada cálculo.",
};

export default function QuattroAIPage() {
  return (
    // Sem título nem selo (pedido do dono, 04/11/2026): a tela É a conversa.
    <AppShell title="Quattro AI" semCabecalho>
      <Suspense fallback={null}><AssistenteShell /></Suspense>
    </AppShell>
  );
}
