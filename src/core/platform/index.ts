/**
 * FinancialPlatform — facade da infraestrutura financeira: Ledger Core +
 * Idempotência + Fila + Payment Orchestrator + Observabilidade, sobre a
 * arquitetura de domínios. Recuperação de estado por replay do ledger.
 */
import { LedgerCore } from "./ledger-core";
import { FinancialQueue } from "./queue";
import { IdempotencyStore } from "./idempotency";
import { PaymentOrchestrator, type PagamentoEntrada } from "./payment-orchestrator";
import { checarSaude } from "./observability";
import { DOMINIOS } from "./domains";
import type { ResultadoPagamento } from "./types";

export class FinancialPlatform {
  readonly ledger = new LedgerCore();
  readonly queue = new FinancialQueue();
  readonly idem = new IdempotencyStore();
  readonly orchestrator = new PaymentOrchestrator(this.ledger, this.queue, this.idem);

  processarPagamento(p: PagamentoEntrada): ResultadoPagamento {
    return this.orchestrator.processar(p);
  }

  /** Observabilidade financeira (invariantes em tempo real). */
  saude(saldoReportado?: number) {
    return checarSaude(this.ledger, this.queue, saldoReportado);
  }

  /**
   * Financial State Recovery — reconstrói o caixa puramente a partir do
   * ledger (event sourcing): a verdade não está no dashboard, está aqui.
   */
  recuperarCaixa(): number {
    return this.ledger.saldo("1.1");
  }

  dominios() {
    return DOMINIOS;
  }
}

/** Plataforma demo com algumas liquidações já postadas. */
export function criarPlataformaDemo(): FinancialPlatform {
  const p = new FinancialPlatform();
  // Capital inicial: Caixa (débito) x Patrimônio (crédito) — transação balanceada.
  p.ledger.postar("seed_capital", "Aporte inicial", [
    { accountCode: "1.1", direction: "debit", amount: 500000 },
    { accountCode: "3.1", direction: "credit", amount: 500000 },
  ]);
  p.processarPagamento({ idempotencyKey: "pix_aurora_001", metodo: "pix", valor: 35000, contraparte: "Cliente Aurora" });
  p.processarPagamento({ idempotencyKey: "ted_beta_002", metodo: "ted", valor: 82000, contraparte: "Cliente Beta" });
  return p;
}

export { LedgerCore, PLANO_DE_CONTAS } from "./ledger-core";
export { DOMINIOS } from "./domains";
export { VERSAO_PLATFORM } from "./types";
export type { PagamentoEntrada } from "./payment-orchestrator";
