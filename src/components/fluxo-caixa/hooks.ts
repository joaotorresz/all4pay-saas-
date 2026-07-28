"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRiscoInput, getAccountsList } from "@/lib/data";
import { montarFluxoCaixa, type FluxoModelo } from "@/core/cashflow";
import { compararFluxo, type ComparativoFluxo } from "@/core/cashflow/comparativo";
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

/**
 * Comparativo período × período anterior (cards Resultado/Gastos/Receitas e o
 * Sankey). Lê o MESMO `RiskInput` e obedece aos MESMOS filtros do header.
 */
export function useComparativo(filtros: FluxoFiltros): {
  isLoading: boolean; isError: boolean; data: ComparativoFluxo | undefined;
} {
  const inp = useQuery({ queryKey: ["risco-input"], queryFn: getRiscoInput });
  const dias = diasDe(filtros);
  const data = useMemo(
    () => (inp.data
      ? compararFluxo(inp.data, { dias, conta: filtros.conta, regime: filtros.regime, visao: filtros.visao })
      : undefined),
    [inp.data, dias, filtros.conta, filtros.regime, filtros.visao],
  );
  return { isLoading: inp.isLoading, isError: inp.isError, data };
}
