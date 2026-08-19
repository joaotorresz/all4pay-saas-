/**
 * Governança ↔ membros reais da organização.
 *  • demo  → participantes no perfil local (a4p_company), com id estável;
 *  • live  → tabela `organization_members` via funções SECURITY DEFINER (0012):
 *    `org_members` (lista a equipe), `org_invite_by_email` (adiciona um usuário
 *    existente por e-mail), `org_member_update` / `org_member_remove`. A chave
 *    do membro em live é o `user_id`. O papel app-level (administrador/gestor/…)
 *    + permissões ficam no jsonb `permissions`; `role` base vira admin quando o
 *    papel é administrador, senão member (o owner nunca é rebaixado por aqui).
 */
import { createClient } from "@/lib/supabase/client";
import { isDemo } from "@/lib/demo";
import { loadCompany, saveCompany } from "@/lib/company";
import type { Participante, PapelUsuario, PermissoesUsuario } from "@/core/onboarding";

export interface GovMember extends Participante { id: string; isOwner?: boolean }

/** Convite de novos usuários por e-mail (live) já disponível (RPC org_invite_by_email). */
export const conviteDisponivel = true;

const uuid = () => globalThis.crypto?.randomUUID?.() ?? `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const PERM_PADRAO: PermissoesUsuario = { visualizar: true, editar: false, autonomia: false };
const roleDoPapel = (papel?: PapelUsuario) => (papel === "administrador" ? "admin" : "member");

function permsJson(m: Participante) {
  return {
    funcao: m.funcao ?? "",
    aprovaPagamentos: !!m.aprovaPagamentos,
    papel: m.papel ?? "operador",
    permissoes: m.permissoes ?? PERM_PADRAO,
  };
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
  const { data, error } = await s.rpc("org_members");
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const perms = (r.permissions ?? {}) as Record<string, unknown>;
    const role = String(r.role ?? "member");
    const papel = (perms.papel as PapelUsuario) ?? (role === "owner" || role === "admin" ? "administrador" : "operador");
    return {
      id: String(r.user_id),
      isOwner: role === "owner",
      nome: String(r.display_name ?? ""),
      email: String(r.email ?? ""),
      funcao: String(perms.funcao ?? ""),
      aprovaPagamentos: !!perms.aprovaPagamentos,
      limite: "", // DEPRECADO: ver central_alcada (alçada por papel)
      papel,
      permissoes: (perms.permissoes as PermissoesUsuario) ?? PERM_PADRAO,
    };
  });
}

/** Cria/convida (demo: local; live: RPC) ou ATUALIZA um participante. */
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
  const s = createClient();
  let userId = m.id;
  if (!userId) {
    // Convite: adiciona um usuário existente (por e-mail) à organização.
    if (!m.email?.trim()) throw new Error("Informe o e-mail do usuário para adicionar.");
    const { data, error } = await s.rpc("org_invite_by_email", {
      p_email: m.email.trim(), p_role: roleDoPapel(m.papel), p_display_name: m.nome || null,
    });
    if (error) throw new Error(error.message);
    userId = String(data);
  }
  const { error } = await s.rpc("org_member_update", {
    p_user_id: userId,
    p_display_name: m.nome || null,
    p_email: m.email || null,
    p_permissions: permsJson(m),
    // ⚠️ **DEPRECADA.** `organization_members.approval_limit` nunca teve leitor
    // e era escrita errada (parseLimite fazia "R$50 mil" virar 50 e "Sem limite"
    // virar 0). A alçada mora em `central_alcada`, por PAPEL. Mandamos `null` e
    // o SERVIDOR ignora o parâmetro — a migration
    // 20260819140000_alcada_morada_unica tirou a gravação de dentro da RPC, que
    // é o que impede o próximo formulário de reabrir a porta.
    p_approval_limit: null,
    p_can_cancel: !!m.permissoes?.autonomia,
  });
  if (error) throw new Error(error.message);
}

export async function removeMember(id: string): Promise<void> {
  if (isDemo) {
    const c = loadCompany() ?? {};
    const next = ((c.participantes ?? []) as GovMember[]).filter((x) => x.id !== id);
    saveCompany({ ...c, participantes: next });
    return;
  }
  const { error } = await createClient().rpc("org_member_remove", { p_user_id: id });
  if (error) throw new Error(error.message);
}
