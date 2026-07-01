/**
 * Financial Queue System — operações financeiras NUNCA dependem de um
 * request síncrono simples. Fila com retry, backoff, deduplicação por
 * idempotency_key e replay. Determinístico (simulado in-memory); em
 * escala troca por BullMQ/RabbitMQ sem mudar o contrato.
 */
import type { QueueJob, MetodoPagamento } from "./types";
import { uid } from "./types";

const BACKOFF_MS = [0, 2000, 4000, 8000, 16000];

export class FinancialQueue {
  private fila: QueueJob[] = [];

  /** Enfileira (idempotente): mesma key não cria job duplicado. */
  enfileirar(idempotencyKey: string, metodo: MetodoPagamento, valor: number, contraparte?: string, maxTentativas = 4): QueueJob {
    const existente = this.fila.find((j) => j.idempotencyKey === idempotencyKey);
    if (existente) return existente;
    const job: QueueJob = {
      id: uid("job"),
      idempotencyKey,
      metodo,
      valor,
      contraparte,
      status: "pendente",
      tentativas: 0,
      maxTentativas,
      criadoEm: new Date().toISOString(),
    };
    this.fila.push(job);
    return job;
  }

  /**
   * Processa um job aplicando o handler. Se o handler lançar, conta a
   * tentativa e agenda retry (ou marca falha ao esgotar). Idempotente:
   * jobs já concluídos não reprocessam.
   */
  processar(jobId: string, handler: (job: QueueJob) => void): QueueJob {
    const job = this.fila.find((j) => j.id === jobId);
    if (!job || job.status === "concluido") return job!;
    job.status = "processando";
    job.tentativas += 1;
    try {
      handler(job);
      job.status = "concluido";
      job.proximoRetryMs = undefined;
      job.ultimoErro = undefined;
    } catch (e) {
      job.ultimoErro = e instanceof Error ? e.message : "falha";
      if (job.tentativas >= job.maxTentativas) {
        job.status = "falha";
        job.proximoRetryMs = undefined;
      } else {
        job.status = "retentando";
        job.proximoRetryMs = BACKOFF_MS[Math.min(job.tentativas, BACKOFF_MS.length - 1)];
      }
    }
    return job;
  }

  /** Replay: reabilita um job (falho/retentando) para novo processamento, com
   *  orçamento de tentativas ZERADO (reprocesso do zero — senão um job que já
   *  esgotou as tentativas falharia de novo na 1ª chamada). */
  replay(jobId: string): void {
    const job = this.fila.find((j) => j.id === jobId);
    if (job && job.status !== "concluido") {
      job.status = "pendente";
      job.tentativas = 0;
      job.proximoRetryMs = undefined;
      job.ultimoErro = undefined;
    }
  }

  jobs(): QueueJob[] {
    return [...this.fila].reverse();
  }

  pendentes(): QueueJob[] {
    return this.fila.filter((j) => j.status === "pendente" || j.status === "retentando");
  }
}
