"use client";

import { AppShell } from "@/components/app/AppShell";
import { ConfirmacaoView } from "@/components/confirmacao/ConfirmacaoView";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";

export default function ConfirmacaoPage() {
  return (
    <AppShell
      title="Confirmação"
      crumb="Upload de dados · revisar lançamentos"
      actions={isDemo ? <DemoBadge /> : undefined}
    >
      <ConfirmacaoView />
    </AppShell>
  );
}
