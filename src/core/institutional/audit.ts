/**
 * trilhaAuditoriaCompleta() — o módulo mais importante: dinheiro exige
 * rastreabilidade total. Cada ação vira um evento IMUTÁVEL encadeado por
 * SHA-256 (blockchain interno de auditoria). Inclui:
 *   • before/after intelligence (detecta alteração crítica / suspeita)
 *   • verificação de integridade (se alguém altera, o hash quebra)
 *   • replay temporal / event sourcing (estado em qualquer instante)
 *   • export legal (JSON / CSV)
 */
import type {
  AuditEvent,
  AuditAction,
  AuditContext,
  AuditFlag,
  EntityType,
  IntegridadeResult,
} from "./types";
import { uid } from "./types";
import { sha256 } from "./sha256";

const GENESIS = "0".repeat(64);

/** Payload canônico e estável (ordena chaves) para o hash. */
function canonical(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj ?? null);
  if (Array.isArray(obj)) return `[${obj.map(canonical).join(",")}]`;
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonical((obj as Record<string, unknown>)[k])}`)
    .join(",")}}`;
}

/**
 * Hash do evento: SHA256 encadeando previousHash + TODOS os campos materiais.
 * Sela também entityType/entityId e o ctx forense (quem/ip/device): sem eles
 * no preimage, reescrever o autor (ctx.userId) ou repontar o evento p/ outra
 * entidade (entityId) passaria em verificarIntegridade — furando a atribuição.
 */
export function hashEvento(
  previousHash: string,
  action: AuditAction,
  timestamp: string,
  before: unknown,
  after: unknown,
  entityType?: EntityType,
  entityId?: string,
  ctx?: AuditContext,
): string {
  return sha256(
    `${previousHash}|${action}|${timestamp}|${entityType ?? ""}|${entityId ?? ""}|${canonical(ctx ?? null)}|${canonical(before)}|${canonical(after)}`,
  );
}

/** before/after intelligence — sinaliza mudanças críticas/suspeitas. */
export function analisarMudanca(
  action: AuditAction,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): AuditFlag[] {
  const flags: AuditFlag[] = [];
  if (!before || !after) return flags;

  // Aumento de valor
  const vAntes = Number(before.valor ?? before.amount ?? NaN);
  const vDepois = Number(after.valor ?? after.amount ?? NaN);
  if (!Number.isNaN(vAntes) && !Number.isNaN(vDepois) && vDepois !== vAntes) {
    const delta = vDepois - vAntes;
    const pct = vAntes !== 0 ? delta / vAntes : 1;
    flags.push({
      nivel: pct > 0.5 ? "critico" : "atencao",
      campo: "valor",
      descricao: `Valor alterado de ${fmt(vAntes)} para ${fmt(vDepois)} (${delta > 0 ? "+" : ""}${Math.round(pct * 100)}%)`,
    });
  }

  // Alteração após aprovação
  if (action === "updated" && (before.aprovado === true || before.status === "aprovado")) {
    flags.push({
      nivel: "critico",
      campo: "status",
      descricao: "Alteração APÓS aprovação — requer reaprovação",
    });
  }

  // Mudança de dados bancários / favorecido
  for (const campo of ["favorecido", "contraparte", "chavePix", "conta", "agencia"]) {
    // presença em UM dos lados basta: INJETAR uma chave Pix num registro que não
    // tinha (before sem o campo) é a fraude que este alarme existe p/ pegar —
    // exigir `in before && in after` deixava passar exatamente esse caso.
    if ((campo in before || campo in after) && before[campo] !== after[campo]) {
      flags.push({
        nivel: "critico",
        campo,
        descricao: `Dado bancário alterado: ${campo} "${String(before[campo])}" → "${String(after[campo])}"`,
      });
    }
  }

  return flags;
}

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(v);
}

/**
 * Trilha de auditoria com cadeia de hash imutável.
 * Append-only: cada evento referencia o hash do anterior.
 */
export class TrilhaAuditoria {
  private eventos: AuditEvent[] = [];

  constructor(eventosIniciais?: AuditEvent[]) {
    if (eventosIniciais) this.eventos = [...eventosIniciais];
  }

  private ultimoHash(): string {
    return this.eventos.length ? this.eventos[this.eventos.length - 1].hash : GENESIS;
  }

  /** Registra um evento e fecha o elo da cadeia. */
  registrar(args: {
    entityType: EntityType;
    entityId: string;
    action: AuditAction;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    ctx: AuditContext;
    timestamp?: string;
  }): AuditEvent {
    const before = args.before ?? null;
    const after = args.after ?? null;
    const timestamp = args.timestamp ?? new Date().toISOString();
    const previousHash = this.ultimoHash();
    const ev: AuditEvent = {
      id: uid("audit"),
      seq: this.eventos.length,
      entityType: args.entityType,
      entityId: args.entityId,
      action: args.action,
      before,
      after,
      ctx: args.ctx,
      timestamp,
      previousHash,
      hash: hashEvento(previousHash, args.action, timestamp, before, after, args.entityType, args.entityId, args.ctx),
      flags: analisarMudanca(args.action, before, after),
    };
    this.eventos.push(ev);
    return ev;
  }

  todos(): AuditEvent[] {
    return [...this.eventos];
  }

  /** Verifica a integridade da cadeia: recomputa hashes e elos. */
  verificarIntegridade(): IntegridadeResult {
    let prev = GENESIS;
    for (let i = 0; i < this.eventos.length; i++) {
      const e = this.eventos[i];
      if (e.previousHash !== prev)
        return {
          intacta: false,
          total: this.eventos.length,
          verificados: i,
          problema: { seq: e.seq, id: e.id, motivo: "Elo anterior não confere" },
        };
      const recomputado = hashEvento(e.previousHash, e.action, e.timestamp, e.before, e.after, e.entityType, e.entityId, e.ctx);
      if (recomputado !== e.hash)
        return {
          intacta: false,
          total: this.eventos.length,
          verificados: i,
          problema: { seq: e.seq, id: e.id, motivo: "Conteúdo do evento foi adulterado" },
        };
      prev = e.hash;
    }
    return { intacta: true, total: this.eventos.length, verificados: this.eventos.length };
  }

  /**
   * Replay temporal / event sourcing: reconstrói o estado de uma entidade
   * em qualquer instante do passado, aplicando os eventos até `quando`.
   */
  reconstruirEstado(
    entityType: EntityType,
    entityId: string,
    quando: string,
  ): Record<string, unknown> | null {
    let estado: Record<string, unknown> | null = null;
    for (const e of this.eventos) {
      if (e.entityType !== entityType || e.entityId !== entityId) continue;
      if (e.timestamp > quando) break;
      if (e.action === "deleted") estado = null;
      else estado = { ...(estado ?? {}), ...(e.after ?? {}) };
    }
    return estado;
  }

  /** Export legal — JSON ou CSV, com a flag de integridade. */
  exportar(formato: "json" | "csv"): string {
    if (formato === "json")
      return JSON.stringify(
        { integridade: this.verificarIntegridade(), eventos: this.eventos },
        null,
        2,
      );
    const head = [
      "seq",
      "timestamp",
      "entityType",
      "entityId",
      "action",
      "userName",
      "ip",
      "flags",
      "hash",
    ].join(";");
    const rows = this.eventos.map((e) =>
      [
        e.seq,
        e.timestamp,
        e.entityType,
        e.entityId,
        e.action,
        e.ctx.userName,
        e.ctx.ip,
        e.flags.map((f) => f.campo).join("/") || "—",
        e.hash.slice(0, 16),
      ].join(";"),
    );
    return [head, ...rows].join("\n");
  }
}
