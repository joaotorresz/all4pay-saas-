/**
 * Event Store — não guarda só o "estado atual", guarda TODA a história.
 * Append-only, encadeado por SHA-256 (event sourcing + auditoria
 * institucional). Permite replay para reconstruir o estado em qualquer
 * ponto e denuncia adulteração (o hash quebra).
 */
import { sha256 } from "@/core/institutional/sha256";
import type {
  EventoEntrada,
  EventoArmazenado,
  IntegridadeEventStore,
} from "./types";
import { uid } from "./types";

const GENESIS = "0".repeat(64);

function hashEvento(
  previousHash: string,
  tipo: string,
  timestamp: string,
  valor: number,
  payload: unknown,
  entidadeId: string | undefined,
  contraparte: string | undefined,
  prioridade: string,
): string {
  // Sela TAMBÉM os campos de identidade (entidadeId/contraparte/prioridade):
  // eles dirigem atribuição no ledger/grafo — se ficassem fora do preimage,
  // adulterar a contraparte de um PIX selado passaria em verificarIntegridade.
  return sha256(
    `${previousHash}|${tipo}|${timestamp}|${valor}|${entidadeId ?? ""}|${contraparte ?? ""}|${prioridade}|${JSON.stringify(payload ?? null)}`,
  );
}

export class EventStore {
  private eventos: EventoArmazenado[] = [];

  append(e: EventoEntrada): EventoArmazenado {
    const previousHash = this.eventos.length ? this.eventos[this.eventos.length - 1].hash : GENESIS;
    const timestamp = e.timestamp ?? new Date().toISOString();
    const valor = e.valor ?? 0;
    const payload = e.payload ?? {};
    const prioridade = e.prioridade ?? "media";
    const armazenado: EventoArmazenado = {
      id: uid("evt"),
      seq: this.eventos.length,
      tipo: e.tipo,
      entidadeId: e.entidadeId,
      valor,
      contraparte: e.contraparte,
      prioridade,
      payload,
      timestamp,
      previousHash,
      hash: hashEvento(previousHash, e.tipo, timestamp, valor, payload, e.entidadeId, e.contraparte, prioridade),
    };
    this.eventos.push(armazenado);
    return armazenado;
  }

  todos(): EventoArmazenado[] {
    return [...this.eventos];
  }

  verificarIntegridade(): IntegridadeEventStore {
    let prev = GENESIS;
    for (const e of this.eventos) {
      if (e.previousHash !== prev)
        return { intacta: false, total: this.eventos.length, problema: { seq: e.seq, motivo: "Elo quebrado" } };
      const rec = hashEvento(e.previousHash, e.tipo, e.timestamp, e.valor, e.payload, e.entidadeId, e.contraparte, e.prioridade);
      if (rec !== e.hash)
        return { intacta: false, total: this.eventos.length, problema: { seq: e.seq, motivo: "Evento adulterado" } };
      prev = e.hash;
    }
    return { intacta: true, total: this.eventos.length };
  }

  /** Event sourcing: reduz todos os eventos a um estado acumulado. */
  replay<T>(inicial: T, reducer: (acc: T, e: EventoArmazenado) => T): T {
    return this.eventos.reduce(reducer, inicial);
  }
}
