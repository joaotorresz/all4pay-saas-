"use client";

import { useReceivables } from "./hooks";
import { OpenAmountWidget } from "./OpenAmountWidget";

export function ReceivablesCard() {
  const { data, isLoading, isError } = useReceivables();
  return (
    <OpenAmountWidget
      title="A Receber"
      href="/recebiveis"
      summary={data}
      isLoading={isLoading}
      isError={isError}
      emptyHint="Nenhum recebível em aberto neste mês."
    />
  );
}
