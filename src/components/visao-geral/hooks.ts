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
  getRiscoInput,
} from "@/lib/data";
import { getAuditTrail } from "@/lib/institutional";
import { scoreRiscoCaixa } from "@/core/risk-engine";
import { analisarInadimplencia } from "@/core/risk";
import { analisarQuantitativo } from "@/core/quant";
import { centroInteligencia } from "@/core/executive";
import { decidir } from "@/core/decision";
import { analisarMoat } from "@/core/datamoat";
import type { MovementType } from "@/lib/types";

/** Cash-risk engine: fetches the input then runs scoreRiscoCaixa over it. */
export function useRiscoCaixa() {
  const q = useQuery({ queryKey: ["risco-input"], queryFn: getRiscoInput });
  return {
    ...q,
    data: q.data ? scoreRiscoCaixa(q.data) : undefined,
  };
}

/** Credit/delinquency engine: same input, runs analisarInadimplencia. */
export function useInadimplencia() {
  const q = useQuery({ queryKey: ["risco-input"], queryFn: getRiscoInput });
  return {
    ...q,
    data: q.data ? analisarInadimplencia(q.data) : undefined,
  };
}

/** Camada quantitativa: mesmo input, roda analisarQuantitativo. */
export function useQuantitativo() {
  const q = useQuery({ queryKey: ["risco-input"], queryFn: getRiscoInput });
  return {
    ...q,
    data: q.data ? analisarQuantitativo(q.data) : undefined,
  };
}

/** Financial Data Moat: DNA, benchmark, comportamento, crédito e modelo. */
export function useMoat() {
  const q = useQuery({ queryKey: ["risco-input"], queryFn: getRiscoInput });
  return {
    ...q,
    data: q.data ? analisarMoat(q.data) : undefined,
  };
}

/** Decision Engine: feature store → risco → previsão → recomendação → plano. */
export function useDecisao() {
  const q = useQuery({ queryKey: ["risco-input"], queryFn: getRiscoInput });
  return {
    ...q,
    data: q.data ? decidir(q.data) : undefined,
  };
}

/** Input cru para a camada de orquestração (constrói o orquestrador na UI). */
export function useOrquestracaoInput() {
  return useQuery({ queryKey: ["risco-input"], queryFn: getRiscoInput });
}

/** IA executiva: centro de inteligência (briefing, insights, forecast…). */
export function useCentroInteligencia() {
  const q = useQuery({ queryKey: ["risco-input"], queryFn: getRiscoInput });
  return {
    ...q,
    data: q.data ? centroInteligencia(q.data) : undefined,
  };
}

/** Trilha de auditoria institucional (hash-chain) — demo ou live. */
export function useAuditTrail() {
  return useQuery({ queryKey: ["audit-trail"], queryFn: getAuditTrail });
}

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
