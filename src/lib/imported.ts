/**
 * Dataset importado (FDIP) — quando presente, vira a FONTE de dados do
 * sistema em demonstração: dashboard, DRE, risco, inteligência etc. passam
 * a ler estes lançamentos em vez do seed. Persistido em localStorage para
 * sobreviver a navegação/refresh. Em live, os dados vão para o Supabase.
 */
import type { Movement, FinancialAccount, Party } from "@/lib/types";
import { DEMO_MOVEMENTS, DEMO_ACCOUNTS, DEMO_PARTIES } from "@/lib/demo/seed";

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

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Anexa UM lançamento (e, opcionalmente, um contato novo) ao dataset ativo —
 * usado pelo upload de documento (boleto/comprovante) na home. Se ainda não há
 * dataset importado, parte de um snapshot do seed para NÃO esconder a demo: o
 * documento entra somando-se ao que já aparece no dashboard. `baixaDe` marca um
 * lançamento pendente existente como pago (comprovante de algo agendado).
 * Retorna o id da party (existente ou criada) para ligar ao lançamento.
 */
export function appendImported(input: {
  movement: Movement;
  party?: Party;
  baixaDe?: string;
}): void {
  const base: ImportedDataset = load() ?? {
    movements: [...DEMO_MOVEMENTS],
    accounts: [...DEMO_ACCOUNTS],
    parties: [...DEMO_PARTIES],
    criadoEm: new Date().toISOString(),
  };

  let parties = base.parties;
  if (input.party) {
    const existe = parties.find((p) => norm(p.name) === norm(input.party!.name));
    if (!existe) parties = [...parties, input.party];
  }

  let movements = base.movements;
  if (input.baixaDe) {
    movements = movements.map((m) =>
      m.id === input.baixaDe
        ? { ...m, status: "pago", paid_date: input.movement.paid_date ?? input.movement.due_date, reconciled: true }
        : m,
    );
  } else {
    movements = [input.movement, ...movements];
  }

  setImported({ ...base, movements, parties });
}

/** Atualiza uma party no dataset importado (demo) — ex.: adicionar telefone. */
export function updateImportedParty(id: string, patch: Partial<Party>): boolean {
  const ds = load();
  if (!ds) return false;
  const i = ds.parties.findIndex((p) => p.id === id);
  if (i < 0) return false;
  ds.parties[i] = { ...ds.parties[i], ...patch };
  setImported({ ...ds });
  return true;
}
