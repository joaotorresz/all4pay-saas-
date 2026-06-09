/**
 * Acessor da camada institucional (governança).
 * - Auditoria: em demo, a trilha selada (`trilhaDemo`); em live, constrói
 *   a cadeia de hash sobre os registros reais de `audit_log`.
 * - RBAC, policy engine e regras de aprovação são CONFIGURAÇÃO (não
 *   dados), expostos diretamente do core.
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import { TrilhaAuditoria } from "@/core/institutional/audit";
import { trilhaDemo } from "@/core/institutional/demo";
import type { AuditAction, AuditEvent, EntityType } from "@/core/institutional/types";

const ACAO_MAP: Record<string, AuditAction> = {
  created: "created",
  criar: "created",
  updated: "updated",
  atualizar: "updated",
  deleted: "deleted",
  excluir: "deleted",
  approved: "approved",
  aprovar: "approved",
  rejected: "rejected",
  executed: "executed",
  executar: "executed",
  reconciled: "reconciled",
};

function mapAcao(acao: string): AuditAction {
  const k = acao.toLowerCase();
  for (const key of Object.keys(ACAO_MAP)) if (k.includes(key)) return ACAO_MAP[key];
  return "updated";
}

/** Constrói a trilha (com cadeia de hash) a partir dos dados disponíveis. */
export async function getAuditTrail(): Promise<{
  eventos: AuditEvent[];
  integridade: ReturnType<TrilhaAuditoria["verificarIntegridade"]>;
}> {
  if (isDemo) {
    const t = trilhaDemo();
    return { eventos: t.todos(), integridade: t.verificarIntegridade() };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("id,usuario,acao,antes,depois,created_at")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const t = new TrilhaAuditoria();
  for (const row of data ?? []) {
    const r = row as {
      id: string;
      usuario: string;
      acao: string;
      antes: Record<string, unknown> | null;
      depois: Record<string, unknown> | null;
      created_at: string;
    };
    t.registrar({
      entityType: "movement" as EntityType,
      entityId: r.id,
      action: mapAcao(r.acao),
      before: r.antes,
      after: r.depois,
      ctx: {
        userId: r.usuario,
        userName: r.usuario,
        companyId: "—",
        ip: "—",
        device: "—",
        browser: "—",
        os: "—",
      },
      timestamp: r.created_at,
    });
  }
  return { eventos: t.todos(), integridade: t.verificarIntegridade() };
}
