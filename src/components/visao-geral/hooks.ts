"use client";

/**
 * One data hook per widget. Each is a thin React Query wrapper over the
 * corresponding `data.ts` accessor, so widgets stay isolated and load
 * independently (their own skeleton, error and empty states).
 */
import { useQuery } from "@tanstack/react-query";
import {
  getReceivables,
  getPayables,
  getAccounts,
  getDailyCashflow,
  getSales,
  getOpenMovements,
  getUnreconciledMovements,
} from "@/lib/data";
import type { MovementType } from "@/lib/types";

export function useReceivables() {
  return useQuery({ queryKey: ["receivables"], queryFn: getReceivables });
}

export function usePayables() {
  return useQuery({ queryKey: ["payables"], queryFn: getPayables });
}

export function useAccounts() {
  return useQuery({ queryKey: ["accounts"], queryFn: getAccounts });
}

export function useDailyCashflow(days = 14) {
  return useQuery({
    queryKey: ["daily-cashflow", days],
    queryFn: () => getDailyCashflow(days),
  });
}

export function useSalesChart(months = 12) {
  return useQuery({
    queryKey: ["sales", months],
    queryFn: () => getSales(months),
  });
}

export function useOpenMovements(type: MovementType) {
  return useQuery({
    queryKey: ["open-movements", type],
    queryFn: () => getOpenMovements(type),
  });
}

export function useUnreconciled(accountId?: string) {
  return useQuery({
    queryKey: ["unreconciled", accountId ?? "all"],
    queryFn: () => getUnreconciledMovements(accountId),
  });
}
