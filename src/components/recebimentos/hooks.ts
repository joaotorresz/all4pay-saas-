"use client";

import { useQuery } from "@tanstack/react-query";
import { getOpenMovements, getAccountsList, getRiscoInput } from "@/lib/data";
import { listParties } from "@/lib/cadastros";

/** Títulos de entrada em aberto — a MESMA fonte de /recebiveis (hub getRiscoInput). */
export function useRecebiveisOpen() {
  return useQuery({ queryKey: ["open-movements", "entrada"], queryFn: () => getOpenMovements("entrada") });
}
/** RiskInput completo (inclui RECEBIDOS) — para o card "Contas recebidas". */
export function useRiscoInputReceb() {
  return useQuery({ queryKey: ["risco-input"], queryFn: getRiscoInput });
}
export function useContasReceb() {
  return useQuery({ queryKey: ["accounts-list"], queryFn: getAccountsList });
}
export function usePartiesReceb() {
  return useQuery({ queryKey: ["parties-list"], queryFn: listParties });
}
