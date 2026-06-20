"use client";

import { useReceivables } from "./hooks";
import { OpenAmountWidget } from "./OpenAmountWidget";

export function ReceivablesCard() {
  const { data, isLoading, isError } = useReceivables();
  return (
    <OpenAmountWidget
      title="A Receber"
      href="/recebimentos?aba=titulos"
      summary={data}
      isLoading={isLoading}
      isError={isError}
      emptyHint="Nenhum recebível em aberto neste mês."
      heroLabel="Recebido hoje"
      weekLabel="A receber essa semana"
      monthLabel="A receber esse mês"
    />
  );
}
