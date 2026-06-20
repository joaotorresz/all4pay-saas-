"use client";

import { usePayables } from "./hooks";
import { OpenAmountWidget } from "./OpenAmountWidget";

export function PayablesCard() {
  const { data, isLoading, isError } = usePayables();
  return (
    <OpenAmountWidget
      title="A Pagar"
      href="/pagamentos?aba=titulos"
      summary={data}
      isLoading={isLoading}
      isError={isError}
      emptyHint="Nenhuma conta a pagar em aberto neste mês."
      heroLabel="Pago hoje"
      weekLabel="A pagar essa semana"
      monthLabel="A pagar esse mês"
    />
  );
}
