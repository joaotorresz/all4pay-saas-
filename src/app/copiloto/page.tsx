import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { InteligenciaShell } from "@/components/copiloto/InteligenciaShell";

export const metadata: Metadata = {
  title: "all4pay.IA",
  description:
    "all4pay.IA: copiloto + Quant, Decisão, Risco, Autônomo e Dados em abas — um cérebro, não cinco.",
};

export default function CopilotoPage() {
  return (
    <AppShell
      title="all4pay.IA"
      crumb="all4pay.IA"
      actions={isDemo ? <DemoBadge /> : null}
    >
      <Suspense fallback={null}>
        <InteligenciaShell />
      </Suspense>
    </AppShell>
  );
}
