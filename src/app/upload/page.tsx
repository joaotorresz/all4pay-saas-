"use client";

import { AppShell } from "@/components/app/AppShell";
import { IngestaoView } from "@/components/ingestao/IngestaoView";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";

export default function UploadPage() {
  return (
    <AppShell
      title="Upload de dados"
      crumb="Ingestão · conectar · enviar · conciliar"
      actions={isDemo ? <DemoBadge /> : undefined}
    >
      <IngestaoView />
    </AppShell>
  );
}
