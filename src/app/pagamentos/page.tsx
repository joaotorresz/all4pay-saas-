"use client";

import { AppShell } from "@/components/app/AppShell";
import { MoneyFunnel } from "@/components/visao-geral/MoneyFunnel";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";

export default function PagamentosPage() {
  return (
    <AppShell title="Pagar" actions={isDemo ? <DemoBadge /> : undefined}>
      <MoneyFunnel direction="saida" />
    </AppShell>
  );
}
