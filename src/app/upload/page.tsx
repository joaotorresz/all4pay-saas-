"use client";

import { AppShell } from "@/components/app/AppShell";
import { UploadView } from "@/components/upload/UploadView";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";

export default function UploadPage() {
  return (
    <AppShell
      title="Upload de dados"
      crumb="Ingestão · documentos e extratos"
      actions={isDemo ? <DemoBadge /> : undefined}
    >
      <UploadView />
    </AppShell>
  );
}
