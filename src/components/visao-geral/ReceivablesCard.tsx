"use client";

import { useReceivables } from "./hooks";
import { OpenAmountWidget } from "./OpenAmountWidget";

export function ReceivablesCard() {
  const { data, isLoading, isError } = useReceivables();
  return (
    <OpenAmountWidget
      title="A Receber"
      href="/recebimentos"
      summary={data}
      isLoading={isLoading}
      isError={isError}
      emptyHint="Nenhum recebível em aberto neste mês."
      heroLabel="Recebido hoje"
      weekLabel="A receber essa semana"
      monthLabel="A receber esse mês"
      info={{
        titulo: "A Receber",
        oQue: "O que já entrou hoje e o que ainda está previsto entrar (essa semana e esse mês).",
        comoCalcula: "Destaque = entradas pagas hoje. Secundários = entradas pendentes que vencem até domingo (semana) e até o fim do mês, pela data de vencimento.",
      }}
    />
  );
}
