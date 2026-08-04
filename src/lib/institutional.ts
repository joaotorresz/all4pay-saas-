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
import { TETO_LINHAS } from "@/lib/supabase/consulta";

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

/**
 * Que ENTIDADE o evento tocou.
 *
 * ⚠️ Tudo virava `movement` aqui — o acessor não tinha de onde tirar o tipo, e
 * "Lançamento" era o rótulo que sobrava. Com o gatilho da 0026 a trilha passou
 * a receber gravações de ESTADO (orçamento, aprovação, fechamento), e uma
 * auditoria que chama fechamento de lançamento responde a pergunta errada com
 * ar de resposta certa.
 *
 * O identificador do evento de estado é a CHAVE, não o id da linha: quem audita
 * procura "orçamentos", e um uuid não se procura.
 */
function entidadeDoEvento(
  acao: string,
  depois: Record<string, unknown> | null,
  idDaLinha: string,
): { entityType: EntityType; entityId: string } {
  if (acao.toLowerCase().startsWith("estado.")) {
    const chave = typeof depois?.chave === "string" ? depois.chave : "";
    return { entityType: "state", entityId: chave || idDaLinha };
  }
  return { entityType: "movement", entityId: idDaLinha };
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
    .order("created_at", { ascending: true }).limit(TETO_LINHAS);
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
    const { entityType, entityId } = entidadeDoEvento(r.acao, r.depois, r.id);
    t.registrar({
      entityType,
      entityId,
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
