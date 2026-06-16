"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getCategories,
  getCostCenters,
  getParties,
  getAccountsList,
  createLancamento,
} from "@/lib/data";
import {
  getBrands,
  getUnits,
  getSalespeople,
  getProducts,
  getServices,
  createTransferencia,
  createSaleDoc,
  createContrato,
  createParty,
  updateParty,
  createProduct,
  updateProduct,
  createService,
  createBrand,
  createUnit,
  listProducts,
  listServices,
  listParties,
  listSales,
} from "@/lib/cadastros";
import type { CategoryKind, PartyInput, ProductInput } from "@/lib/types";

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

export function useBrands() {
  return useQuery({ queryKey: ["brands"], queryFn: getBrands });
}
export function useUnits() {
  return useQuery({ queryKey: ["units"], queryFn: getUnits });
}
export function useSalespeople() {
  return useQuery({ queryKey: ["salespeople"], queryFn: getSalespeople });
}
export function useProducts() {
  return useQuery({ queryKey: ["products"], queryFn: getProducts });
}
export function useServices() {
  return useQuery({ queryKey: ["services"], queryFn: getServices });
}

/** Invalidate the overview widgets fed by movements. */
function invalidateOverview(qc: ReturnType<typeof useQueryClient>) {
  ["receivables", "payables", "accounts", "daily-cashflow", "sales"].forEach(
    (k) => qc.invalidateQueries({ queryKey: [k] }),
  );
}

/** Submit hook for the Receita/Despesa lançamento. */
export function useCreateLancamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createLancamento,
    onSuccess: () => invalidateOverview(qc),
  });
}

export function useCreateTransferencia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createTransferencia,
    onSuccess: () => invalidateOverview(qc),
  });
}

export function useCreateSaleDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createSaleDoc,
    onSuccess: () => invalidateOverview(qc),
  });
}

export function useCreateContrato() {
  return useMutation({ mutationFn: createContrato });
}

export function useCreateParty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createParty,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["parties"] }),
  });
}

export function useUpdateParty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<PartyInput> }) => updateParty(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["parties"] });
      qc.invalidateQueries({ queryKey: ["parties-list"] });
    },
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ProductInput }) => updateProduct(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["products-list"] });
    },
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createProduct,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useCreateService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createService,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["services"] }),
  });
}

export function useCreateBrand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createBrand,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["brands"] }),
  });
}

export function useCreateUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createUnit,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["units"] }),
  });
}

/* ---- listing queries ---- */
export function useProductsList() {
  return useQuery({ queryKey: ["products-list"], queryFn: listProducts });
}
export function useServicesList() {
  return useQuery({ queryKey: ["services-list"], queryFn: listServices });
}
export function usePartiesList() {
  return useQuery({ queryKey: ["parties-list"], queryFn: listParties });
}
export function useSalesList() {
  return useQuery({ queryKey: ["sales-list"], queryFn: listSales });
}
