"use client";

import { AppShell } from "@/components/app/AppShell";
import { MovementsScreen } from "@/components/visao-geral/MovementsScreen";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";

export default function PagaveisPage() {
  return (
    <AppShell title="Saídas" crumb="Início" actions={isDemo ? <DemoBadge /> : null}>
      <MovementsScreen direction="saida" />
    </AppShell>
  );
}
