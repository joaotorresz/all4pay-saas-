"use client";

import { AppShell } from "@/components/app/AppShell";
import { MovementsScreen } from "@/components/visao-geral/MovementsScreen";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";

export default function RecebiveisPage() {
  return (
    <AppShell title="Entradas" crumb="Início" actions={isDemo ? <DemoBadge /> : null}>
      <MovementsScreen direction="entrada" />
    </AppShell>
  );
}
