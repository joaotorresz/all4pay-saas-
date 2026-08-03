import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { InteligenciaShell } from "@/components/copiloto/InteligenciaShell";

export const metadata: Metadata = {
  title: "Copiloto · all4pay",
  description:
    "All 4 Pay AI: copiloto + Quant, Decisão, Risco, Autônomo e Dados em abas — um cérebro, não cinco.",
};

export default function CopilotoPage() {
  return (
    <AppShell
      title="Copiloto"
      crumb="All 4 Pay AI"
      actions={isDemo ? <DemoBadge /> : null}
    >
      <Suspense fallback={null}>
        <InteligenciaShell />
      </Suspense>
    </AppShell>
  );
}
