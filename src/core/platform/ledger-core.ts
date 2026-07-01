/**
 * Double-Entry Ledger Engine — o coração. Toda movimentação gera débito
 * e crédito que SOMAM ZERO. O saldo de cada conta é estado DERIVADO dos
 * lançamentos (o ledger é a verdade absoluta — nunca o dashboard nem a
 * tabela de transações). Append-only, reversível, auditável.
 */
import type {
  Account,
  AccountType,
  Posting,
  LedgerTransaction,
  AccountBalance,
  TrialBalance,
} from "./types";
import { uid } from "./types";

/** Lado normal de cada tipo de conta (onde o saldo cresce). */
const NORMAL_DEBIT: Record<AccountType, boolean> = {
  asset: true,
  expense: true,
  liability: false,
  equity: false,
  revenue: false,
};

/** Plano de contas inicial. */
export const PLANO_DE_CONTAS: Account[] = [
  { code: "1.1", name: "Caixa e bancos", type: "asset" },
  { code: "1.2", name: "Clientes a receber", type: "asset" },
  { code: "1.3", name: "Clientes em atraso", type: "asset" },
  { code: "2.1", name: "Saldo de clientes", type: "liability" },
  { code: "2.2", name: "Contas a pagar", type: "liability" },
  { code: "3.1", name: "Patrimônio", type: "equity" },
  { code: "4.1", name: "Receitas", type: "revenue" },
  { code: "5.1", name: "Despesas", type: "expense" },
];

export class LedgerCore {
  private accounts = new Map<string, Account>();
  private transacoes: LedgerTransaction[] = [];

  constructor(plano: Account[] = PLANO_DE_CONTAS) {
    plano.forEach((a) => this.accounts.set(a.code, a));
  }

  conta(code: string): Account | undefined {
    return this.accounts.get(code);
  }
  plano(): Account[] {
    return Array.from(this.accounts.values());
  }

  /**
   * Posta uma transação balanceada. Rejeita se débitos != créditos ou se
   * alguma conta não existe — a invariante contábil é inviolável.
   */
  postar(ref: string, descricao: string, postings: Posting[], timestamp?: string): LedgerTransaction {
    if (postings.length < 2) throw new Error("Transação precisa de ao menos 2 partidas");
    let deb = 0;
    let cred = 0;
    for (const p of postings) {
      if (!this.accounts.has(p.accountCode)) throw new Error(`Conta inexistente: ${p.accountCode}`);
      if (p.amount <= 0) throw new Error("Valor de partida deve ser positivo");
      if (p.direction === "debit") deb += p.amount;
      else cred += p.amount;
    }
    if (Math.abs(deb - cred) > 1e-6) throw new Error(`Transação desbalanceada: D ${deb} ≠ C ${cred}`);

    const tx: LedgerTransaction = {
      id: uid("tx"),
      seq: this.transacoes.length,
      ref,
      descricao,
      timestamp: timestamp ?? new Date().toISOString(),
      postings,
    };
    this.transacoes.push(tx);
    return tx;
  }

  /** Reversão: cria a transação espelho (débito↔crédito). */
  reverter(txId: string, motivo = "estorno"): LedgerTransaction {
    const orig = this.transacoes.find((t) => t.id === txId);
    if (!orig) throw new Error("Transação não encontrada");
    // Idempotência do estorno: não reverter a mesma transação duas vezes (senão
    // o saldo DERIVADO fica errado — dois espelhos anulam o original 2x).
    if (this.transacoes.some((t) => t.revertidaDe === txId)) throw new Error("Transação já estornada");
    if (orig.revertidaDe) throw new Error("Não é possível estornar um estorno");
    const espelho = orig.postings.map((p) => ({
      accountCode: p.accountCode,
      direction: p.direction === "debit" ? ("credit" as const) : ("debit" as const),
      amount: p.amount,
    }));
    const tx = this.postar(orig.ref, `${motivo}: ${orig.descricao}`, espelho);
    tx.revertidaDe = txId;
    return tx;
  }

  /** Saldo de uma conta — DERIVADO dos lançamentos. */
  saldo(code: string): number {
    const acc = this.accounts.get(code);
    if (!acc) return 0;
    const debitNormal = NORMAL_DEBIT[acc.type];
    let total = 0;
    for (const t of this.transacoes)
      for (const p of t.postings) {
        if (p.accountCode !== code) continue;
        const sinal = p.direction === "debit" ? 1 : -1;
        total += (debitNormal ? sinal : -sinal) * p.amount;
      }
    return total;
  }

  saldos(): AccountBalance[] {
    return this.plano().map((a) => ({ code: a.code, name: a.name, type: a.type, saldo: this.saldo(a.code) }));
  }

  /** Trial balance — a invariante global: Σdébitos == Σcréditos. */
  trialBalance(): TrialBalance {
    let deb = 0;
    let cred = 0;
    for (const t of this.transacoes)
      for (const p of t.postings) {
        if (p.direction === "debit") deb += p.amount;
        else cred += p.amount;
      }
    return { totalDebito: deb, totalCredito: cred, balanceado: Math.abs(deb - cred) < 1e-6 };
  }

  transactions(): LedgerTransaction[] {
    return [...this.transacoes];
  }
}
