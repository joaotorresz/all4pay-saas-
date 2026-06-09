/** Audit Trail — tudo rastreável (compliance / financeiro corporativo). */
import type { AuditLog } from "./types";
import { uid } from "./types";

export class AuditTrail {
  private logs: AuditLog[] = [];

  registrar(usuario: string, acao: string, antes: unknown, depois: unknown): AuditLog {
    const log: AuditLog = {
      id: uid("audit"),
      usuario,
      acao,
      antes,
      depois,
      timestamp: new Date().toISOString(),
    };
    this.logs.unshift(log);
    return log;
  }

  todos(): AuditLog[] {
    return [...this.logs];
  }
}
