/**
 * all4pay — Razão de dupla entrada (Fase 0 do blueprint Campfire).
 * Domínio TIPADO do general ledger que espelha as invariantes do banco
 * (migration 0010): todo lançamento postado tem ∑débito = ∑crédito; dinheiro
 * com 4 casas (nunca float solto); imutabilidade por estorno. Puro e testável —
 * a persistência (Supabase) entra na camada lib na Fase 1 (ponte ingestão→razão).
 */
export const VERSAO_LEDGER = "ledger/1.0.0";

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";
export type EntryStatus = "draft" | "posted" | "void";

export interface LedgerLineInput {
  accountId: string;
  debit?: number;
  credit?: number;
  dimensions?: Record<string, string | number>;
  memo?: string;
}
export interface LedgerEntryInput {
  entryDate: string; // ISO
  description?: string;
  source?: string; // manual|bank|ar|ap|revrec|depreciation|system
  externalKey?: string; // idempotência (ex.: id Pluggy)
  lines: LedgerLineInput[];
}

/** Arredonda a 4 casas (NUMERIC(20,4)) — evita lixo de ponto flutuante. */
export const r4 = (n: number) => Math.round((n + Number.EPSILON) * 1e4) / 1e4;

export function totais(lines: LedgerLineInput[]): { debito: number; credito: number } {
  let debito = 0, credito = 0;
  for (const l of lines) { debito += l.debit ?? 0; credito += l.credit ?? 0; }
  return { debito: r4(debito), credito: r4(credito) };
}

/** Invariante do sistema: ∑débito = ∑crédito (e > 0). */
export function balanceado(lines: LedgerLineInput[]): boolean {
  const { debito, credito } = totais(lines);
  return debito > 0 && debito === credito;
}
export function exigirBalanceado(lines: LedgerLineInput[]): void {
  const { debito, credito } = totais(lines);
  if (debito <= 0) throw new Error("Lançamento sem valor.");
  if (debito !== credito) throw new Error(`Lançamento desbalanceado (D ${debito} ≠ C ${credito}).`);
  for (const l of lines) {
    if ((l.debit ?? 0) > 0 && (l.credit ?? 0) > 0) throw new Error("Linha não pode ser débito E crédito.");
    if ((l.debit ?? 0) < 0 || (l.credit ?? 0) < 0) throw new Error("Débito/crédito não podem ser negativos.");
  }
}

/** Saldo por natureza: ativo/despesa sobem no débito; passivo/PL/receita no crédito. */
export function saldoPorNatureza(type: AccountType, debito: number, credito: number): number {
  const naturezaDebito = type === "asset" || type === "expense";
  return r4(naturezaDebito ? debito - credito : credito - debito);
}

/**
 * Ponte ingestão → razão: um movimento simples (entrada/saída) vira um
 * lançamento balanceado de 2 linhas (caixa/banco × receita/despesa).
 * - entrada: débito no caixa, crédito na conta de receita;
 * - saída:   débito na conta de despesa, crédito no caixa.
 */
export function lancamentoDeMovimento(input: {
  tipo: "entrada" | "saida";
  valor: number;
  data: string;
  contaCaixaId: string;
  contaResultadoId: string;
  descricao?: string;
  externalKey?: string;
  dimensions?: Record<string, string | number>;
}): LedgerEntryInput {
  const v = r4(Math.abs(input.valor));
  const linhas: LedgerLineInput[] = input.tipo === "entrada"
    ? [
        { accountId: input.contaCaixaId, debit: v, dimensions: input.dimensions },
        { accountId: input.contaResultadoId, credit: v, dimensions: input.dimensions },
      ]
    : [
        { accountId: input.contaResultadoId, debit: v, dimensions: input.dimensions },
        { accountId: input.contaCaixaId, credit: v, dimensions: input.dimensions },
      ];
  return { entryDate: input.data, description: input.descricao, source: "bank", externalKey: input.externalKey, lines: linhas };
}

/** Estorno (reversal): espelha as linhas (débito↔crédito) — correção sem editar o original. */
export function estornar(entry: LedgerEntryInput): LedgerEntryInput {
  return {
    entryDate: entry.entryDate,
    description: `Estorno: ${entry.description ?? ""}`.trim(),
    source: "system",
    lines: entry.lines.map((l) => ({ accountId: l.accountId, debit: l.credit ?? 0, credit: l.debit ?? 0, dimensions: l.dimensions, memo: l.memo })),
  };
}
