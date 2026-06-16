/**
 * Lista UNIFICADA de contas: manuais (financial_accounts) + Open Finance
 * (bank_accounts), sem duplicar (2A). Quando uma conta OF está vinculada a uma
 * manual (linked_financial_account_id), vira UMA linha com os dois saldos (1C);
 * o saldo efetivo (que conta na posição) segue o balance_source. OF sem vínculo
 * com mesmo banco de uma manual → aviso de possível duplicata (não vincula só).
 */
import type { FinancialAccount } from "@/lib/types";
import type { BankAccount } from "@/lib/data";

export interface ContaUnificada {
  key: string;
  origem: "manual" | "open_finance" | "vinculada";
  nome: string;
  banco: string;
  saldoManual?: number;
  saldoOF?: number;
  saldoEfetivo: number;
  balanceSource?: BankAccount["balanceSource"];
  bankAccountId?: string;
  financialAccountId?: string;
  /** id da conta manual candidata a vínculo (OF sem vínculo com mesmo banco). */
  duplicataCom?: string;
}

const norm = (s?: string | null) => (s ?? "").toLowerCase().trim();
function mesmoBanco(finBank?: string | null, connector?: string | null, accName?: string | null): boolean {
  const f = norm(finBank);
  if (!f) return false;
  const c = `${norm(connector)} ${norm(accName)}`;
  return c.includes(f) || (norm(connector).length > 0 && f.includes(norm(connector)));
}

export function unificarContas(financ: FinancialAccount[], bank: BankAccount[]): ContaUnificada[] {
  const linkedFinIds = new Set(bank.map((b) => b.linkedFinancialAccountId).filter(Boolean) as string[]);
  const finById = new Map(financ.map((f) => [f.id, f]));
  const out: ContaUnificada[] = [];

  for (const b of bank) {
    const bancoLabel = b.connectorName || "Open Finance";
    const linked = b.linkedFinancialAccountId ? finById.get(b.linkedFinancialAccountId) : undefined;
    if (linked) {
      const efetivo = b.balanceSource === "manual" ? linked.balance : b.balance; // both_visible → OF no cálculo
      out.push({
        key: `link-${b.id}`, origem: "vinculada",
        nome: linked.name || b.name || bancoLabel, banco: linked.bank || bancoLabel,
        saldoManual: linked.balance, saldoOF: b.balance, saldoEfetivo: efetivo,
        balanceSource: b.balanceSource, bankAccountId: b.id, financialAccountId: linked.id,
      });
    } else {
      const dup = financ.find((f) => !linkedFinIds.has(f.id) && mesmoBanco(f.bank, b.connectorName, b.name));
      out.push({
        key: `of-${b.id}`, origem: "open_finance",
        nome: b.name || bancoLabel, banco: bancoLabel,
        saldoOF: b.balance, saldoEfetivo: b.balance, bankAccountId: b.id,
        duplicataCom: dup?.id,
      });
    }
  }

  for (const f of financ) {
    if (linkedFinIds.has(f.id)) continue; // já exibida na linha vinculada
    out.push({ key: `man-${f.id}`, origem: "manual", nome: f.name, banco: f.bank, saldoManual: f.balance, saldoEfetivo: f.balance, financialAccountId: f.id });
  }
  return out;
}

/** Mapeia as contas unificadas para FinancialAccount[] (saldo efetivo) — entra
 *  no treasuryCore p/ recalcular posição/liquidez/concentração sem duplicar. */
export function contasEfetivas(unificadas: ContaUnificada[]): FinancialAccount[] {
  return unificadas.map((c) => ({ id: c.key, name: c.nome, bank: c.banco, balance: c.saldoEfetivo }));
}
