"use client";

import { MovementsTable } from "./MovementsTable";
import { useUnreconciled } from "./hooks";

export function ConciliacaoView({ accountId }: { accountId?: string }) {
  const { data, isLoading, isError } = useUnreconciled(accountId);
  return (
    <MovementsTable
      movements={data}
      isLoading={isLoading}
      isError={isError}
      emptyTitle="Nada a conciliar"
      emptyHint="Todas as movimentações desta seleção já foram conciliadas."
      variant="reconcile"
    />
  );
}
