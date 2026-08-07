"use client";

import { usePayables } from "./hooks";
import { OpenAmountWidget } from "./OpenAmountWidget";

export function PayablesCard() {
  const { data, isLoading, isError } = usePayables();
  return (
    <OpenAmountWidget
      title="A Pagar"
      href="/pagamentos"
      summary={data}
      isLoading={isLoading}
      isError={isError}
      emptyHint="Nenhuma conta a pagar em aberto neste mês."
      heroLabel="Pago hoje"
      weekLabel="A pagar essa semana"
      monthLabel="A pagar esse mês"
      info={{
        titulo: "A Pagar",
        oQue: "O que já saiu hoje e o que ainda está previsto pagar (essa semana e esse mês).",
        comoCalcula: "Destaque = saídas pagas hoje. Secundários = saídas pendentes que vencem até domingo (semana) e até o fim do mês, pela data de vencimento.",
      }}
    />
  );
}
