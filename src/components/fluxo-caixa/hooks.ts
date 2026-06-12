"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRiscoInput, getAccountsList } from "@/lib/data";
import { montarFluxoCaixa, type FluxoModelo } from "@/core/cashflow";
import { diasDe, type FluxoFiltros } from "./FiltrosContext";

/** Carrega contas (para o seletor do header). */
export function useContas() {
  return useQuery({ queryKey: ["accounts-list"], queryFn: getAccountsList });
}

/**
 * Modelo completo do Fluxo de Caixa — reprocessa quando QUALQUER filtro muda
 * (período/conta entram na chave). Roda os motores sobre o RiskInput.
 */
export function useFluxoCaixa(filtros: FluxoFiltros): {
  isLoading: boolean; isError: boolean; data: FluxoModelo | undefined;
} {
  const inp = useQuery({ queryKey: ["risco-input"], queryFn: getRiscoInput });
  const acc = useQuery({ queryKey: ["accounts-list"], queryFn: getAccountsList });
  const dias = diasDe(filtros);
  const data = useMemo(
    () => (inp.data && acc.data
      ? montarFluxoCaixa(inp.data, acc.data, { dias, conta: filtros.conta, regime: filtros.regime, visao: filtros.visao })
      : undefined),
    [inp.data, acc.data, dias, filtros.conta, filtros.regime, filtros.visao],
  );
  return { isLoading: inp.isLoading || acc.isLoading, isError: inp.isError || acc.isError, data };
}
