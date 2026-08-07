/**
 * Payment Orchestrator — coordena o ciclo de vida do pagamento (PIX,
 * boleto, TED, cartão) sem lógica financeira espalhada: idempotência →
 * fila (retry) → ledger de dupla partida → liquidação. Toda a verdade
 * financeira passa pelo ledger.
 */
import type { LedgerCore } from "./ledger-core";
import type { FinancialQueue } from "./queue";
import type { IdempotencyStore } from "./idempotency";
import type { MetodoPagamento, Posting, QueueJob, ResultadoPagamento } from "./types";

/** Partidas contábeis por método (entrada de recurso para a empresa). */
function partidasRecebimento(valor: number): Posting[] {
  return [
    { accountCode: "1.1", direction: "debit", amount: valor }, // Caixa e bancos ↑
    { accountCode: "2.1", direction: "credit", amount: valor }, // Saldo de clientes ↑ (passivo)
  ];
}

export interface PagamentoEntrada {
  idempotencyKey: string;
  metodo: MetodoPagamento;
  valor: number;
  contraparte?: string;
  /** Simula uma falha transitória (a fila deve reprocessar com sucesso). */
  falharVezes?: number;
}

export class PaymentOrchestrator {
  private falhasRestantes = new Map<string, number>();

  constructor(
    private ledger: LedgerCore,
    private queue: FinancialQueue,
    private idem: IdempotencyStore,
  ) {}

  /** Processa um pagamento ponta a ponta (idempotente). */
  processar(p: PagamentoEntrada): ResultadoPagamento {
    // 1) Idempotência: mesma key não executa de novo.
    if (this.idem.visto(p.idempotencyKey)) {
      return {
        idempotencyKey: p.idempotencyKey,
        duplicado: true,
        status: "concluido",
        tentativas: 0,
        transacaoId: this.idem.ref(p.idempotencyKey),
        detalhe: "Duplicado ignorado pela camada de idempotência.",
      };
    }

    // 2) Enfileira (idempotente) e configura falhas simuladas.
    const job = this.queue.enfileirar(p.idempotencyKey, p.metodo, p.valor, p.contraparte);
    if (p.falharVezes && !this.falhasRestantes.has(p.idempotencyKey))
      this.falhasRestantes.set(p.idempotencyKey, p.falharVezes);

    // Reenvio de um job que já esgotou as tentativas (falha) ou ficou pendente
    // de retry: reabre com orçamento zerado. Sem isso, o loop abaixo veria
    // status "falha" e devolveria falha permanente — uma indisponibilidade
    // transitória que passou nunca se auto-curaria por processarPagamento.
    if (job.status === "falha" || job.status === "retentando") this.queue.replay(job.id);

    // 3) Drena o job com retry até concluir ou esgotar.
    let last: QueueJob = job;
    while (last.status !== "concluido" && last.status !== "falha") {
      last = this.queue.processar(job.id, (j) => this.liquidar(j));
    }

    if (last.status === "concluido") {
      const ref = this.idem.ref(p.idempotencyKey);
      return {
        idempotencyKey: p.idempotencyKey,
        duplicado: false,
        status: "concluido",
        tentativas: last.tentativas,
        transacaoId: ref,
        detalhe: `Liquidado em ${last.tentativas} tentativa(s).`,
      };
    }
    return {
      idempotencyKey: p.idempotencyKey,
      duplicado: false,
      status: "falha",
      tentativas: last.tentativas,
      detalhe: `Falhou após ${last.tentativas} tentativas: ${last.ultimoErro}.`,
    };
  }

  /** Liquidação: posta no ledger (dupla partida) e sela a idempotência. */
  private liquidar(job: QueueJob): void {
    const restantes = this.falhasRestantes.get(job.idempotencyKey) ?? 0;
    if (restantes > 0) {
      this.falhasRestantes.set(job.idempotencyKey, restantes - 1);
      throw new Error("falha transitória no PSP/banco");
    }
    const tx = this.ledger.postar(
      job.idempotencyKey,
      `${job.metodo.toUpperCase()} ${job.contraparte ?? ""}`.trim(),
      partidasRecebimento(job.valor),
    );
    this.idem.registrar(job.idempotencyKey, tx.id);
  }
}
