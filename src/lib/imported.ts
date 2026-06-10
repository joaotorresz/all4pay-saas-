/**
 * Dataset importado (FDIP) — quando presente, vira a FONTE de dados do
 * sistema em demonstração: dashboard, DRE, risco, inteligência etc. passam
 * a ler estes lançamentos em vez do seed. Persistido em localStorage para
 * sobreviver a navegação/refresh. Em live, os dados vão para o Supabase.
 */
import type { Movement, FinancialAccount, Party } from "@/lib/types";

const KEY = "a4p_imported_dataset";

export interface ImportedDataset {
  movements: Movement[];
  accounts: FinancialAccount[];
  parties: Party[];
  criadoEm: string;
}

let cache: ImportedDataset | null | undefined;

function load(): ImportedDataset | null {
  if (cache !== undefined) return cache;
  if (typeof window === "undefined") {
    cache = null;
    return null;
  }
  try {
    const s = localStorage.getItem(KEY);
    cache = s ? (JSON.parse(s) as ImportedDataset) : null;
  } catch {
    cache = null;
  }
  return cache;
}

export function setImported(ds: ImportedDataset): void {
  cache = ds;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(KEY, JSON.stringify(ds));
    } catch {
      /* ignore */
    }
  }
}

export function clearImported(): void {
  cache = null;
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }
}

export function hasImported(): boolean {
  return !!load();
}
export function importedMovements(): Movement[] | null {
  return load()?.movements ?? null;
}
export function importedAccounts(): FinancialAccount[] | null {
  return load()?.accounts ?? null;
}
export function importedParties(): Party[] | null {
  return load()?.parties ?? null;
}
