"use client";

import { AppShell } from "@/components/app/AppShell";
import { ConciliacaoView } from "@/components/conciliacao/ConciliacaoView";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { isDemo } from "@/lib/demo";

export default function ConciliacaoPage() {
  return (
    <AppShell
      title="Conciliação"
      crumb="Upload de dados · Open Finance × títulos"
      actions={isDemo ? <DemoBadge /> : null}
    >
      <ConciliacaoView />
    </AppShell>
  );
}
