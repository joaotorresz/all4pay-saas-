"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getCategories,
  getCostCenters,
  getParties,
  getAccountsList,
  createLancamento,
} from "@/lib/data";
import type { CategoryKind } from "@/lib/types";

export function useCategories(kind: CategoryKind) {
  return useQuery({
    queryKey: ["categories", kind],
    queryFn: () => getCategories(kind),
  });
}

export function useCostCenters() {
  return useQuery({ queryKey: ["cost-centers"], queryFn: getCostCenters });
}

export function usePartiesByRole(role: "customer" | "supplier" | "carrier") {
  return useQuery({
    queryKey: ["parties", role],
    queryFn: () => getParties(role),
  });
}

export function useAccountsList() {
  return useQuery({ queryKey: ["accounts-list"], queryFn: getAccountsList });
}

/** Submit hook for the Receita/Despesa lançamento. */
export function useCreateLancamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createLancamento,
    onSuccess: () => {
      // Refresh the overview widgets that depend on movements.
      qc.invalidateQueries({ queryKey: ["receivables"] });
      qc.invalidateQueries({ queryKey: ["payables"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["daily-cashflow"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
    },
  });
}
