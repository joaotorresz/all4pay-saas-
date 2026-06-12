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

  // Conta-alvo REAL (evita account_id órfão) e ajuste de saldo quando realizado,
  // para "Caixa atual"/Saldo total reagirem ao lançamento confirmado.
  const accounts = base.accounts.map((a) => ({ ...a }));
  const contaAlvo =
    accounts.find((a) => a.id === input.movement.account_id) ?? accounts[0];
  const ajustarSaldo = (type: Movement["type"], amount: number) => {
    if (contaAlvo) contaAlvo.balance = Math.round((contaAlvo.balance + (type === "entrada" ? amount : -amount)) * 100) / 100;
  };

  let movements = base.movements;
  if (input.baixaDe) {
    movements = movements.map((m) => {
      if (m.id !== input.baixaDe) return m;
      ajustarSaldo(m.type, m.amount); // dar baixa realiza o pendente → mexe no saldo
      return { ...m, status: "pago", paid_date: input.movement.paid_date ?? input.movement.due_date, reconciled: true };
    });
  } else {
    const mov: Movement = { ...input.movement, account_id: contaAlvo?.id ?? input.movement.account_id };
    if (mov.status === "pago") ajustarSaldo(mov.type, mov.amount);
    movements = [mov, ...movements];
  }

  setImported({ ...base, movements, accounts, parties });
}

/**
 * Liquida (paga) N movimentos de saída pendentes — usado pela Central de
 * Pagamentos. Marca pago + paid_date e DEBITA o saldo da conta de saída.
 * Parte do snapshot do seed se ainda não há dataset importado.
 */
export function liquidarImported(ids: string[], accountId: string, paidISO: string): { liquidados: number; total: number } {
  const base: ImportedDataset = load() ?? {
    movements: [...DEMO_MOVEMENTS], accounts: [...DEMO_ACCOUNTS], parties: [...DEMO_PARTIES],
    criadoEm: new Date().toISOString(),
  };
  const alvo = new Set(ids);
  const accounts = base.accounts.map((a) => ({ ...a }));
  const conta = accounts.find((a) => a.id === accountId) ?? accounts[0];
  let total = 0, liquidados = 0;
  const movements = base.movements.map((m) => {
    if (alvo.has(m.id) && m.type === "saida" && m.status === "pendente") {
      total += m.amount; liquidados++;
      return { ...m, status: "pago", paid_date: paidISO, reconciled: true } as Movement;
    }
    return m;
  });
  if (conta && total > 0) conta.balance = Math.round((conta.balance - total) * 100) / 100;
  setImported({ ...base, movements, accounts });
  return { liquidados, total };
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
