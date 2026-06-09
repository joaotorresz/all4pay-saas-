/**
 * Idempotency Layer — obrigatório em fintech: o MESMO pagamento nunca
 * pode executar duas vezes. Toda operação carrega uma idempotency_key;
 * se repetir, o sistema reconhece e ignora a duplicidade.
 */
import type { IdempotencyRecord } from "./types";

export class IdempotencyStore {
  private registros = new Map<string, IdempotencyRecord>();

  visto(key: string): boolean {
    return this.registros.has(key);
  }

  registrar(key: string, resultadoRef: string): void {
    if (this.registros.has(key)) return;
    this.registros.set(key, { key, resultadoRef, criadoEm: new Date().toISOString() });
  }

  ref(key: string): string | undefined {
    return this.registros.get(key)?.resultadoRef;
  }

  todos(): IdempotencyRecord[] {
    return Array.from(this.registros.values());
  }
}
