"use client";

import { useQuery } from "@tanstack/react-query";
import { getOpenMovements, getAccountsList } from "@/lib/data";
import { listParties } from "@/lib/cadastros";

/** Títulos de saída em aberto — a MESMA fonte de /pagaveis (hub getRiscoInput). */
export function usePagaveis() {
  return useQuery({ queryKey: ["open-movements", "saida"], queryFn: () => getOpenMovements("saida") });
}
export function useContasPag() {
  return useQuery({ queryKey: ["accounts-list"], queryFn: getAccountsList });
}
export function usePartiesPag() {
  return useQuery({ queryKey: ["parties-list"], queryFn: listParties });
}
