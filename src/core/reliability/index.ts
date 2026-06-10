/**
 * all4pay — Reliability Layer (GAP 6)
 * -----------------------------------
 * Fintech enterprise vive ou morre aqui. Primitivas de resiliência:
 * circuit breaker, dead-letter queue e distributed lock — para garantir
 * consistência mesmo quando o PSP/banco falha no meio da operação, sem
 * duplicar dinheiro. Puro, determinístico, demo-safe.
 */

export type EstadoBreaker = "fechado" | "aberto" | "meio_aberto";

/** Circuit Breaker — abre após N falhas, bloqueia, e testa recuperação. */
export class CircuitBreaker {
  estado: EstadoBreaker = "fechado";
  private falhas = 0;
  private bloqueadas = 0;

  constructor(private limiar = 3, private cooldownChamadas = 2) {}

  /** Permite a chamada? (gerencia a transição aberto → meio_aberto). */
  permite(): boolean {
    if (this.estado === "aberto") {
      this.bloqueadas += 1;
      if (this.bloqueadas >= this.cooldownChamadas) {
        this.estado = "meio_aberto";
        this.bloqueadas = 0;
      }
      return false;
    }
    return true; // fechado ou meio_aberto (1 probe)
  }

  registrar(sucesso: boolean): void {
    if (sucesso) {
      this.falhas = 0;
      this.estado = "fechado";
    } else {
      this.falhas += 1;
      if (this.estado === "meio_aberto" || this.falhas >= this.limiar) {
        this.estado = "aberto";
        this.bloqueadas = 0;
      }
    }
  }
}

export interface DLQItem {
  id: string;
  key: string;
  motivo: string;
  tentativas: number;
}

/** Dead-Letter Queue — onde vão as operações que esgotaram retries. */
export class DeadLetterQueue {
  private itensList: DLQItem[] = [];
  private seq = 0;

  enviar(key: string, motivo: string, tentativas: number): DLQItem {
    const it: DLQItem = { id: `dlq_${this.seq++}`, key, motivo, tentativas };
    this.itensList.push(it);
    return it;
  }
  itens(): DLQItem[] {
    return [...this.itensList];
  }
  reprocessar(id: string): DLQItem | null {
    const i = this.itensList.findIndex((x) => x.id === id);
    if (i < 0) return null;
    const [it] = this.itensList.splice(i, 1);
    return it;
  }
}

/** Distributed Lock — impede execução concorrente da mesma chave. */
export class LockManager {
  private locks = new Map<string, string>();
  private seq = 0;

  adquirir(key: string): string | null {
    if (this.locks.has(key)) return null;
    const token = `lock_${this.seq++}`;
    this.locks.set(key, token);
    return token;
  }
  liberar(key: string, token: string): boolean {
    if (this.locks.get(key) !== token) return false;
    this.locks.delete(key);
    return true;
  }
  detem(key: string): boolean {
    return this.locks.has(key);
  }
}

/* ---- Runner de demonstração ---- */
export interface PassoResiliencia {
  ordem: number;
  evento: string;
  acao: string;
  estadoBreaker: EstadoBreaker;
  status: "ok" | "retry" | "curto_circuito" | "dlq" | "lock";
}
export interface ResultadoResiliencia {
  passos: PassoResiliencia[];
  estadoFinal: EstadoBreaker;
  dlq: DLQItem[];
  processados: number;
  duplicadosBloqueados: number;
}

export interface TentativaPagamento {
  key: string;
  falhar?: boolean; // o PSP falha nesta chamada
}

/**
 * Simula o processamento resiliente de uma sequência de pagamentos:
 * circuit breaker protege contra um PSP instável, retries reprocessam,
 * o que esgota vai para a DLQ, e o lock impede cobrança duplicada.
 */
export function simularResiliencia(tentativas: TentativaPagamento[], maxRetries = 2): ResultadoResiliencia {
  const breaker = new CircuitBreaker(3, 2);
  const dlq = new DeadLetterQueue();
  const locks = new LockManager();
  const passos: PassoResiliencia[] = [];
  let ordem = 0;
  let processados = 0;
  let duplicados = 0;
  const concluidos = new Set<string>();

  for (const t of tentativas) {
    // Idempotência via lock: chave já concluída não reprocessa.
    if (concluidos.has(t.key)) {
      duplicados++;
      passos.push({ ordem: ordem++, evento: t.key, acao: "Duplicado bloqueado (já liquidado)", estadoBreaker: breaker.estado, status: "lock" });
      continue;
    }
    const token = locks.adquirir(t.key);
    if (!token) {
      duplicados++;
      passos.push({ ordem: ordem++, evento: t.key, acao: "Lock retido — execução concorrente bloqueada", estadoBreaker: breaker.estado, status: "lock" });
      continue;
    }

    let ok = false;
    for (let tentativa = 1; tentativa <= maxRetries + 1; tentativa++) {
      if (!breaker.permite()) {
        passos.push({ ordem: ordem++, evento: t.key, acao: "Circuito aberto — chamada curto-circuitada", estadoBreaker: breaker.estado, status: "curto_circuito" });
        break;
      }
      const sucesso = !t.falhar;
      breaker.registrar(sucesso);
      if (sucesso) {
        ok = true;
        processados++;
        concluidos.add(t.key);
        passos.push({ ordem: ordem++, evento: t.key, acao: `Liquidado na tentativa ${tentativa}`, estadoBreaker: breaker.estado, status: "ok" });
        break;
      }
      passos.push({ ordem: ordem++, evento: t.key, acao: `Falha do PSP — tentativa ${tentativa}/${maxRetries + 1}`, estadoBreaker: breaker.estado, status: "retry" });
    }

    if (!ok) {
      dlq.enviar(t.key, "esgotou retries / circuito aberto", maxRetries + 1);
      passos.push({ ordem: ordem++, evento: t.key, acao: "Enviado para Dead-Letter Queue", estadoBreaker: breaker.estado, status: "dlq" });
    }
    locks.liberar(t.key, token);
  }

  return { passos, estadoFinal: breaker.estado, dlq: dlq.itens(), processados, duplicadosBloqueados: duplicados };
}
