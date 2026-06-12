"use client";

import { useQuery } from "@tanstack/react-query";
import { getOpenMovements, getAccountsList, getRiscoInput } from "@/lib/data";
import { listParties } from "@/lib/cadastros";

/** Títulos de saída em aberto — a MESMA fonte de /pagaveis (hub getRiscoInput). */
export function usePagaveis() {
  return useQuery({ queryKey: ["open-movements", "saida"], queryFn: () => getOpenMovements("saida") });
}
/** RiskInput completo (inclui PAGOS) — para o card "Contas pagas". */
export function useRiscoInputPag() {
  return useQuery({ queryKey: ["risco-input"], queryFn: getRiscoInput });
}
export function useContasPag() {
  return useQuery({ queryKey: ["accounts-list"], queryFn: getAccountsList });
}
export function usePartiesPag() {
  return useQuery({ queryKey: ["parties-list"], queryFn: listParties });
}
