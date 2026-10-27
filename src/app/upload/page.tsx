"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { IngestaoView } from "@/components/ingestao/IngestaoView";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";

export default function UploadPage() {
  return (
    <AppShell
      title="Entrada de dados"
      crumb="Caixa e bancos"
      actions={isDemo ? <DemoBadge /> : undefined}
    >
      <Suspense fallback={null}>
        <IngestaoView />
      </Suspense>
    </AppShell>
  );
}
