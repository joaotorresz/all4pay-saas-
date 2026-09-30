/**
 * Dataset importado (FDIP) — quando presente, vira a FONTE de dados do
 * sistema em demonstração: dashboard, DRE, risco, inteligência etc. passam
 * a ler estes lançamentos em vez do seed. Persistido em localStorage para
 * sobreviver a navegação/refresh. Em live, os dados vão para o Supabase.
 */
import type { Movement, FinancialAccount, Party } from "@/lib/types";
import { DEMO_MOVEMENTS, DEMO_ACCOUNTS, DEMO_PARTIES } from "@/lib/demo/seed";
import { isoDay } from "@/lib/aggregations";
import { chaveDeMovimento } from "@/core/ingestao";
import type { AberturaVerificada } from "@/core/indicadores/abertura";

const KEY = "a4p_imported_dataset";

export interface ImportedDataset {
  movements: Movement[];
  accounts: FinancialAccount[];
  parties: Party[];
  criadoEm: string;
  /**
   * A abertura conferida quando o arquivo importado DECLARA o saldo
   * (`<LEDGERBAL>` do OFX). É a fonte "importada" da cascata: com ela, o saldo
   * da conta é o do banco e a reconciliação do Razão fecha de verdade. Ausente
   * quando o arquivo não declara saldo — a conta fica NÃO CONFERIDA.
   */
  abertura?: AberturaVerificada | null;
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

/**
 * Aplica um extrato importado ao dataset da demonstração SEM apagar o que já
 * estava lá.
 *
 * ⚠️ **A versão anterior SUBSTITUÍA o dataset inteiro** (`setImported`). Achado
 * dirigindo a tela como usuário (30/09/2026): importar o extrato de outubro
 * apagava o de setembro, e toda conta a pagar, venda ou transferência criada
 * antes sumia junto — a tela dizia "importação confirmada" e metade da empresa
 * desaparecia. Em produção isto nunca aconteceu (lá cada linha é um insert com
 * chave); era a demonstração que ensinava o comportamento errado.
 *
 * A regra agora:
 *  - o **seed** da demonstração sai na primeira importação (ele é exemplo, e o
 *    extrato da pessoa ocupa o lugar dele) — mas o que a PESSOA criou fica;
 *  - reimportar o mesmo arquivo não grava nada: a chave de idempotência é a
 *    MESMA da produção (`chaveDeMovimento`);
 *  - a conta importada soma o que ANDOU com as linhas novas; quando o banco
 *    DECLARA o saldo, é ele que vale.
 * Devolve quantas linhas entraram e quantas já existiam.
 */
export function mesclarImportacao(ds: Omit<ImportedDataset, "criadoEm">): { novos: number; repetidos: number } {
  const atual = load();
  const seedMov = new Set(DEMO_MOVEMENTS.map((m) => m.id));
  const mantidos = (atual?.movements ?? []).filter((m) => !seedMov.has(m.id));
  const chaves = new Set(mantidos.map((m) => m.chave ?? chaveDeMovimento(m)));
  const novos: Movement[] = [];
  for (const m of ds.movements) {
    const k = m.chave ?? chaveDeMovimento(m);
    if (chaves.has(k)) continue;
    chaves.add(k);
    novos.push(m);
  }
  const movements = [...mantidos, ...novos];

  // Contas: fica toda conta que algum lançamento mantido usa, mais as novas.
  const usadas = new Set(movements.map((m) => m.account_id).filter(Boolean) as string[]);
  const contas = new Map<string, FinancialAccount>();
  for (const a of atual?.accounts ?? []) if (usadas.has(a.id)) contas.set(a.id, a);
  const andou = novos
    .filter((m) => m.status === "pago")
    .reduce((acc, m) => acc + (m.type === "entrada" ? m.amount : -m.amount), 0);
  for (const a of ds.accounts) {
    const antes = contas.get(a.id);
    contas.set(a.id, antes && !ds.abertura
      ? { ...antes, balance: Math.round((antes.balance + andou) * 100) / 100 }
      : a);
  }

  // Contatos: mesma regra — os referenciados ficam, os novos entram por id.
  const partesUsadas = new Set(movements.map((m) => m.party_id).filter(Boolean) as string[]);
  const partes = new Map<string, Party>();
  for (const p of atual?.parties ?? []) if (partesUsadas.has(p.id) || !DEMO_PARTIES.some((d) => d.id === p.id)) partes.set(p.id, p);
  for (const p of ds.parties) if (!partes.has(p.id)) partes.set(p.id, p);

  setImported({
    movements,
    accounts: Array.from(contas.values()),
    parties: Array.from(partes.values()),
    abertura: ds.abertura ?? atual?.abertura ?? null,
    criadoEm: atual?.criadoEm ?? new Date().toISOString(),
  });
  return { novos: novos.length, repetidos: ds.movements.length - novos.length };
}

/**
 * Apaga o dataset importado e devolve a função que o RESTAURA.
 *
 * ⚠️ Devolver o desfazer é o ponto. A versão anterior apagava e pronto: quem
 * clicasse por engano perdia meses de importação sem volta. O snapshot fica em
 * memória — some ao recarregar a página, o que é aceitável porque o desfazer
 * vale por segundos, e guardá-lo em disco recriaria o problema de espaço que a
 * limpeza veio resolver.
 */
export function clearImported(): () => void {
  const anterior = load();
  cache = null;
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }
  return () => {
    if (anterior) setImported(anterior);
  };
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
/** A abertura conferida do arquivo importado, quando o banco declarou o saldo. */
export function importedAbertura(): AberturaVerificada | null {
  return load()?.abertura ?? null;
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
    // ⚠️ DEDUP EM DUAS CAMADAS, e as duas são necessárias:
    //
    //  1. **por id** — reenviar o MESMO objeto (confirmar duas vezes, um
    //     roll-forward que recomputa o mesmo id) não pode duplicar nem ajustar
    //     o saldo duas vezes;
    //  2. **por CHAVE de idempotência** — o mesmo FATO chegando por outra porta
    //     (o comprovante de um lançamento que o extrato já trouxe) tem id
    //     diferente e é a mesma linha. Sem esta camada, subir o extrato e depois
    //     o comprovante do mesmo pagamento contava a saída duas vezes.
    const chave = mov.chave ?? chaveDeMovimento(mov);
    const jaExiste =
      movements.some((m) => m.id === mov.id) ||
      movements.some((m) => (m.chave ?? chaveDeMovimento(m)) === chave);
    if (!jaExiste) {
      if (mov.status === "pago") ajustarSaldo(mov.type, mov.amount);
      movements = [{ ...mov, chave }, ...movements];
    }
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

/** Baixa de RECEBIMENTOS: marca entradas pendentes como pagas (recebidas) +
 *  CREDITA o saldo da conta escolhida. Espelho de `liquidarImported` (que debita
 *  saídas). Idempotente: só age sobre pendentes. */
export function receberImported(ids: string[], accountId: string, paidISO: string): { recebidos: number; total: number } {
  const base: ImportedDataset = load() ?? {
    movements: [...DEMO_MOVEMENTS], accounts: [...DEMO_ACCOUNTS], parties: [...DEMO_PARTIES],
    criadoEm: new Date().toISOString(),
  };
  const alvo = new Set(ids);
  const accounts = base.accounts.map((a) => ({ ...a }));
  const conta = accounts.find((a) => a.id === accountId) ?? accounts[0];
  let total = 0, recebidos = 0;
  const movements = base.movements.map((m) => {
    if (alvo.has(m.id) && m.type === "entrada" && m.status === "pendente") {
      total += m.amount; recebidos++;
      return { ...m, status: "pago", paid_date: paidISO, reconciled: true } as Movement;
    }
    return m;
  });
  if (conta && total > 0) conta.balance = Math.round((conta.balance + total) * 100) / 100;
  setImported({ ...base, movements, accounts });
  return { recebidos, total };
}

/** Remove movimentos do dataset importado (ex.: faturas projetadas de uma
 *  recorrência cancelada/pausada saem do fluxo previsto). */
export function removerImported(ids: string[]): void {
  const ds = load();
  if (!ds || !ids.length) return;
  const alvo = new Set(ids);
  setImported({ ...ds, movements: ds.movements.filter((m) => !alvo.has(m.id)) });
}

/**
 * Aplica um patch a UM movimento do dataset (ex.: anexar `boleto`). Com
 * `liquidar`, marca pago + paid_date + reconciled e ajusta o saldo da conta
 * (entrada credita, saída debita). Parte do snapshot do seed se necessário.
 */
export function updateImportedMovement(
  id: string,
  patch: Partial<Movement>,
  opts: { liquidar?: boolean; paidISO?: string } = {},
): void {
  const base: ImportedDataset = load() ?? {
    movements: [...DEMO_MOVEMENTS], accounts: [...DEMO_ACCOUNTS], parties: [...DEMO_PARTIES],
    criadoEm: new Date().toISOString(),
  };
  const accounts = base.accounts.map((a) => ({ ...a }));
  const movements = base.movements.map((m) => {
    if (m.id !== id) return m;
    let next = { ...m, ...patch };
    if (opts.liquidar && m.status !== "pago") {
      const conta = accounts.find((a) => a.id === m.account_id) ?? accounts[0];
      if (conta) conta.balance = Math.round((conta.balance + (m.type === "entrada" ? m.amount : -m.amount)) * 100) / 100;
      next = { ...next, status: "pago", paid_date: opts.paidISO ?? isoDay(new Date()), reconciled: true };
    }
    return next;
  });
  setImported({ ...base, movements, accounts });
}

/** Atualiza uma conta financeira no dataset importado (demo) — nome/banco/saldo.
 *  Parte de um snapshot do seed se ainda não houver store (edição funciona já). */
export function updateImportedAccount(id: string, patch: Partial<FinancialAccount>): void {
  const base: ImportedDataset = load() ?? {
    movements: [...DEMO_MOVEMENTS], accounts: [...DEMO_ACCOUNTS], parties: [...DEMO_PARTIES],
    criadoEm: new Date().toISOString(),
  };
  const accounts = base.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a));
  setImported({ ...base, accounts });
}

/** Atualiza uma party no dataset importado (demo) — ex.: adicionar telefone. */
export function updateImportedParty(id: string, patch: Partial<Party>): boolean {
  const ds = load();
  if (!ds) return false;
  const i = ds.parties.findIndex((p) => p.id === id);
  if (i < 0) return false;
  // Copy-on-write (como os outros writers): não mutar o array do cache in place.
  const parties = ds.parties.map((p, j) => (j === i ? { ...p, ...patch } : p));
  setImported({ ...ds, parties });
  return true;
}
