"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app/AppShell";
import { MovementsTable } from "@/components/visao-geral/MovementsTable";
import { useOpenMovements } from "@/components/visao-geral/hooks";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";

export default function PagaveisPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useOpenMovements("saida");
  return (
    <AppShell
      title="A Pagar"
      crumb="Início"
      actions={isDemo ? <DemoBadge /> : null}
    >
      <MovementsTable
        movements={data}
        isLoading={isLoading}
        isError={isError}
        emptyTitle="Nenhuma conta a pagar em aberto"
        emptyHint="Tudo em dia por aqui."
        variant="open"
        editable
        onChanged={() => qc.invalidateQueries()}
      />
    </AppShell>
  );
}
