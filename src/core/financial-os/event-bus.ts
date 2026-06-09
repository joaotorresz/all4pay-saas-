/**
 * Financial Event Bus — arquitetura orientada a eventos. Toda ação
 * financeira publica um evento; múltiplos consumidores reagem de forma
 * desacoplada (IA, alertas, automação, analytics…). In-memory (pub/sub
 * síncrono). Em escala: Kafka / EventBridge / Pub-Sub com o mesmo contrato.
 */
import type { FinancialEvent, FinancialEventType, EventHandler, Prioridade } from "./types";
import { uid } from "./types";

const PRIO_ORDER: Record<Prioridade, number> = { critica: 0, alta: 1, media: 2, baixa: 3 };

export class FinancialEventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private log: FinancialEvent[] = [];

  /** Assina um tipo de evento (ou "*" para todos). */
  subscribe(tipo: FinancialEventType | "*", handler: EventHandler): () => void {
    if (!this.handlers.has(tipo)) this.handlers.set(tipo, new Set());
    this.handlers.get(tipo)!.add(handler);
    return () => this.handlers.get(tipo)?.delete(handler);
  }

  publish(
    tipo: FinancialEventType,
    entidadeId: string,
    payload: Record<string, unknown>,
    prioridade: Prioridade = "media",
  ): FinancialEvent {
    const event: FinancialEvent = {
      id: uid("evt"),
      tipo,
      entidadeId,
      timestamp: new Date().toISOString(),
      payload,
      prioridade,
    };
    this.log.unshift(event);
    if (this.log.length > 200) this.log.pop();

    const alvos = [
      ...Array.from(this.handlers.get(tipo) ?? []),
      ...Array.from(this.handlers.get("*") ?? []),
    ];
    alvos.forEach((h) => h(event));
    return event;
  }

  eventos(): FinancialEvent[] {
    return [...this.log].sort(
      (a, b) =>
        PRIO_ORDER[a.prioridade] - PRIO_ORDER[b.prioridade] ||
        b.timestamp.localeCompare(a.timestamp),
    );
  }
}

/** Cria o barramento já com consumidores padrão acoplados (desacoplados do core). */
export function centralEventosFinanceiros(
  consumidores: Partial<Record<FinancialEventType | "*", EventHandler[]>> = {},
): FinancialEventBus {
  const bus = new FinancialEventBus();
  for (const [tipo, hs] of Object.entries(consumidores)) {
    (hs ?? []).forEach((h) => bus.subscribe(tipo as FinancialEventType | "*", h));
  }
  return bus;
}
