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
  getDailyCashflowRange,
  getSales,
  getOpenMovements,
  getMovementsByFilter,
  type MovementFilter,
  getUnreconciledMovements,
  getRiscoInput,
  getAccountsList,
  getRegrasRecorrentes,
} from "@/lib/data";
import { getAuditTrail } from "@/lib/institutional";
import { isDemo } from "@/lib/demo";
import { scoreRiscoCaixa } from "@/core/risk-engine";
import { analisarInadimplencia } from "@/core/risk";
import { analisarQuantitativo } from "@/core/quant";
import { montarInvestorUpdate } from "@/core/investor";
import { centroInteligencia } from "@/core/executive";
import { decidir } from "@/core/decision";
import { treasuryCore } from "@/core/treasury";
import { operacaoAutonoma } from "@/core/autonomous";
import { financialDRE, periodoPreset, type DREFiltro } from "@/core/dre";
import type { MovementType } from "@/lib/types";

/**
 * First-run: organização live ainda sem nenhum lançamento. Sinaliza para as
 * telas mostrarem orientação de onboarding (importar dados / criar lançamento)
 * em vez de widgets vazios. Reusa a query ["risco-input"] já cacheada.
 * Nunca dispara em demo (o seed sempre tem dados).
 */
export function useFirstRun() {
  const q = useQuery({ queryKey: ["risco-input"], queryFn: getRiscoInput });
  return {
    isLoading: q.isLoading,
    vazio: !isDemo && !!q.data && q.data.movements.length === 0,
  };
}

/** RiskInput cru (movements + partyNames) — para cards período-scoped da Home. */
export function useRiscoInput() {
  return useQuery({ queryKey: ["risco-input"], queryFn: getRiscoInput });
}

/**
 * As REGRAS de recorrência de saída — a fonte da projeção de contas recorrentes.
 *
 * ⚠️ Consulta própria, e não um campo do `RiskInput`: as regras são um cadastro
 * e não um lançamento, e enfiá-las na entrada canônica faria TODA tela do
 * produto pagar uma consulta a mais para servir a uma.
 */
export function useRegrasRecorrentes() {
  return useQuery({ queryKey: ["regras-recorrentes"], queryFn: getRegrasRecorrentes });
}

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

/** Investor update: mesmo input, roda montarInvestorUpdate. */
export function useInvestorUpdate() {
  const q = useQuery({ queryKey: ["risco-input"], queryFn: getRiscoInput });
  return {
    ...q,
    data: q.data ? montarInvestorUpdate(q.data) : undefined,
  };
}


/** DRE Intelligence Center — recomputa por período (preset) e regime. */
export function useDRE(
  preset: "mes" | "mes_anterior" | "ytd" | "12m" = "12m",
  regime: "competencia" | "caixa" = "competencia",
) {
  const q = useQuery({ queryKey: ["risco-input"], queryFn: getRiscoInput });
  let data: ReturnType<typeof financialDRE> | undefined;
  if (q.data) {
    const f: DREFiltro = { ...periodoPreset(q.data.hoje, preset), regime };
    data = financialDRE(q.data, f);
  }
  return { ...q, data };
}

/** Autonomous Financial Ops (GAP 8): decisões + cobrança + roteamento. */
export function useOperacaoAutonoma() {
  const acc = useQuery({ queryKey: ["accounts-list"], queryFn: getAccountsList });
  const inp = useQuery({ queryKey: ["risco-input"], queryFn: getRiscoInput });
  return {
    isLoading: acc.isLoading || inp.isLoading,
    isError: acc.isError || inp.isError,
    data: acc.data && inp.data ? operacaoAutonoma(inp.data, acc.data) : undefined,
  };
}

/** Treasury Core: posição consolidada, concentração bancária, liquidez em buckets. */
export function useTreasuryCore() {
  const acc = useQuery({ queryKey: ["accounts-list"], queryFn: getAccountsList });
  const inp = useQuery({ queryKey: ["risco-input"], queryFn: getRiscoInput });
  return {
    isLoading: acc.isLoading || inp.isLoading,
    isError: acc.isError || inp.isError,
    data: acc.data && inp.data ? treasuryCore(acc.data, inp.data) : undefined,
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

export function useDailyCashflowRange(from: string, to: string) {
  return useQuery({
    queryKey: ["daily-cashflow-range", from, to],
    queryFn: () => getDailyCashflowRange(from, to),
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

export function useMovementsByFilter(type: MovementType, filtro: MovementFilter) {
  return useQuery({
    queryKey: ["movements-filter", type, filtro],
    queryFn: () => getMovementsByFilter(type, filtro),
  });
}

export function useUnreconciled(accountId?: string) {
  return useQuery({
    queryKey: ["unreconciled", accountId ?? "all"],
    queryFn: () => getUnreconciledMovements(accountId),
  });
}
