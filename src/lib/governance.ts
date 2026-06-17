/**
 * Governança ↔ membros reais da organização.
 *  • demo  → participantes no perfil local (a4p_company), com id estável;
 *  • live  → tabela `organization_members` (colunas display_name/email/
 *    permissions/approval_limit/can_cancel — migration 0009).
 * O papel app-level (administrador/gestor/operador/visualizador) + permissões
 * ficam no jsonb `permissions`; `role` (owner/admin/member) NÃO é alterado aqui
 * (evita mexer no privilégio base). Adicionar usuário em live = convite (criar
 * conta no auth) — ainda não implementado: `conviteDisponivel` é false em live.
 */
import { createClient } from "@/lib/supabase/client";
import { isDemo } from "@/lib/demo";
import { loadCompany, saveCompany } from "@/lib/company";
import type { Participante, PapelUsuario, PermissoesUsuario } from "@/core/onboarding";

export interface GovMember extends Participante { id: string; isOwner?: boolean }

/** Em live, adicionar usuário depende de um fluxo de convite (auth) — pendente. */
export const conviteDisponivel = isDemo;

const uuid = () => globalThis.crypto?.randomUUID?.() ?? `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const PERM_PADRAO: PermissoesUsuario = { visualizar: true, editar: false, autonomia: false };

function permsJson(m: Participante) {
  return {
    funcao: m.funcao ?? "",
    aprovaPagamentos: !!m.aprovaPagamentos,
    papel: m.papel ?? "operador",
    permissoes: m.permissoes ?? PERM_PADRAO,
  };
}
function parseLimite(s?: string): number | null {
  if (!s) return null;
  const n = Number(String(s).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export async function listMembers(): Promise<GovMember[]> {
  if (isDemo) {
    const c = loadCompany() ?? {};
    const ps = (c.participantes ?? []) as GovMember[];
    let mutou = false;
    const comId = ps.map((p) => (p.id ? p : ((mutou = true), { ...p, id: uuid() })));
    if (mutou) saveCompany({ ...c, participantes: comId });
    return comId;
  }
  const s = createClient();
  const { data, error } = await s
    .from("organization_members")
    .select("id, role, display_name, email, permissions, approval_limit, can_cancel")
    .order("role");
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const perms = (r.permissions ?? {}) as Record<string, unknown>;
    const role = String(r.role ?? "member");
    const papel = (perms.papel as PapelUsuario) ?? (role === "owner" || role === "admin" ? "administrador" : "operador");
    return {
      id: String(r.id),
      isOwner: role === "owner",
      nome: String(r.display_name ?? ""),
      email: String(r.email ?? ""),
      funcao: String(perms.funcao ?? ""),
      aprovaPagamentos: !!perms.aprovaPagamentos,
      limite: r.approval_limit != null ? String(r.approval_limit) : "",
      papel,
      permissoes: (perms.permissoes as PermissoesUsuario) ?? PERM_PADRAO,
    };
  });
}

/** Cria (demo) ou ATUALIZA (live, membro existente) um participante. */
export async function saveMember(m: GovMember): Promise<void> {
  if (isDemo) {
    const c = loadCompany() ?? {};
    const list = (c.participantes ?? []) as GovMember[];
    const id = m.id || uuid();
    const existe = list.some((x) => x.id === id);
    const next = existe ? list.map((x) => (x.id === id ? { ...m, id } : x)) : [...list, { ...m, id }];
    saveCompany({ ...c, participantes: next });
    return;
  }
  if (!m.id) throw new Error("Convite de novos usuários ainda não disponível em live.");
  const { error } = await createClient()
    .from("organization_members")
    .update({
      display_name: m.nome || null,
      email: m.email || null,
      permissions: permsJson(m),
      approval_limit: parseLimite(m.limite),
      can_cancel: !!m.permissoes?.autonomia,
    })
    .eq("id", m.id);
  if (error) throw error;
}

export async function removeMember(id: string): Promise<void> {
  if (isDemo) {
    const c = loadCompany() ?? {};
    const next = ((c.participantes ?? []) as GovMember[]).filter((x) => x.id !== id);
    saveCompany({ ...c, participantes: next });
    return;
  }
  const { error } = await createClient().from("organization_members").delete().eq("id", id);
  if (error) throw error;
}
