"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app/AppShell";
import { MovementsTable } from "@/components/visao-geral/MovementsTable";
import { useOpenMovements } from "@/components/visao-geral/hooks";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";

export default function RecebiveisPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useOpenMovements("entrada");
  return (
    <AppShell
      title="A Receber"
      crumb="Início"
      actions={isDemo ? <DemoBadge /> : null}
    >
      <MovementsTable
        movements={data}
        isLoading={isLoading}
        isError={isError}
        emptyTitle="Nenhum recebível em aberto"
        emptyHint="Tudo em dia por aqui."
        variant="open"
        editable
        onChanged={() => qc.invalidateQueries()}
      />
    </AppShell>
  );
}
