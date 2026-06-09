"use client";

import { usePayables } from "./hooks";
import { OpenAmountWidget } from "./OpenAmountWidget";

export function PayablesCard() {
  const { data, isLoading, isError } = usePayables();
  return (
    <OpenAmountWidget
      title="A Pagar"
      href="/pagaveis"
      summary={data}
      isLoading={isLoading}
      isError={isError}
      emptyHint="Nenhuma conta a pagar em aberto neste mês."
    />
  );
}
