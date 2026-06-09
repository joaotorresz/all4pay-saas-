"use client";

import { AppShell } from "@/components/app/AppShell";
import { MovementsTable } from "@/components/visao-geral/MovementsTable";
import { useOpenMovements } from "@/components/visao-geral/hooks";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";

export default function PagaveisPage() {
  const { data, isLoading, isError } = useOpenMovements("saida");
  return (
    <AppShell
      title="A Pagar"
      crumb="Visão Geral"
      actions={isDemo ? <DemoBadge /> : null}
    >
      <MovementsTable
        movements={data}
        isLoading={isLoading}
        isError={isError}
        emptyTitle="Nenhuma conta a pagar em aberto"
        emptyHint="Tudo em dia por aqui."
        variant="open"
      />
    </AppShell>
  );
}
