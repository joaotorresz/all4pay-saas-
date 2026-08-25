/**
 * Modo Administrador da plataforma (super-admin) — visão CROSS-TENANT do dono do
 * SaaS: orgs/usuários, ativos, MRR e cobrança de mensalidades. **live**: RPCs
 * SECURITY DEFINER do 0014 (gateadas por `is_platform_admin()`); **demo**: dados
 * sintéticos determinísticos (para visualizar sem ser admin real).
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import { reportar } from "@/lib/erros";

export interface AdminOverview {
  orgs: number; orgs_ativas: number; trials: number; inadimplentes: number;
  usuarios: number; usuarios_ativos: number; mrr: number; arr: number;
}
/**
 * ⚠️ `"none"` entrou, e não é detalhe de tipagem. A RPC devolvia
 * `coalesce(s.status, 'trial')`: 14 das 16 organizações sem NENHUMA linha de
 * assinatura apareciam no painel como teste em curso. Ausência de relação
 * comercial não é teste — é a mesma doença do zero que ocupa o lugar da
 * ausência (ONDA 4), e aqui ela escondia exatamente o alerta que a Etapa D
 * existe para acender.
 */
export type SubStatus = "trial" | "active" | "past_due" | "canceled" | "none";
export interface AdminOrg {
  orgId: string; nome: string; criado: string; membros: number;
  plano: string; status: SubStatus; mrr: number; ultimoMov: string | null; movimentos: number;
  /** `YYYY-MM-DD` do fim do período corrente. Nulo = sem prazo. */
  expira: string | null;
  /** Teto de lançamentos declarado pelo plano; nulo quando o plano não declara. */
  limiteLancamentos: number | null;
}
export interface AdminUser { userId: string; email: string; criado: string; ultimoAcesso: string | null; orgs: number }
export interface AdminPlan { id: string; name: string; priceMonth: number; active: boolean; assinantes: number }

/* ----------------------------- demo ----------------------------- */
const DEMO_PLANS: AdminPlan[] = [
  { id: "pl-starter", name: "Starter", priceMonth: 149, active: true, assinantes: 18 },
  { id: "pl-pro", name: "Pro", priceMonth: 349, active: true, assinantes: 11 },
  { id: "pl-ent", name: "Enterprise", priceMonth: 990, active: true, assinantes: 3 },
];
const DEMO_ORGS: AdminOrg[] = [
  { orgId: "o1", nome: "Açaí do Porto Ltda", criado: "2026-02-11", membros: 4, plano: "Pro", status: "active", mrr: 349, ultimoMov: "2026-06-22", movimentos: 1280, expira: null, limiteLancamentos: 5000 },
  { orgId: "o2", nome: "Studio Marcenaria", criado: "2026-03-02", membros: 2, plano: "Starter", status: "active", mrr: 149, ultimoMov: "2026-06-20", movimentos: 642, expira: null, limiteLancamentos: 500 },
  { orgId: "o3", nome: "Clínica Vida", criado: "2026-04-18", membros: 6, plano: "Enterprise", status: "active", mrr: 990, ultimoMov: "2026-06-23", movimentos: 3104, expira: null, limiteLancamentos: null },
  { orgId: "o4", nome: "Bistrô da Praça", criado: "2026-05-09", membros: 3, plano: "Pro", status: "past_due", mrr: 349, ultimoMov: "2026-06-01", movimentos: 410, expira: null, limiteLancamentos: null },
  { orgId: "o5", nome: "TechParts Imports", criado: "2026-06-15", membros: 1, plano: "—", status: "trial", mrr: 0, ultimoMov: "2026-06-23", movimentos: 88, expira: "2026-06-29", limiteLancamentos: null },
];
const DEMO_USERS: AdminUser[] = [
  { userId: "u1", email: "joao@acaidoporto.com", criado: "2026-02-11", ultimoAcesso: "2026-06-23", orgs: 1 },
  { userId: "u2", email: "marina@studiomarcenaria.com", criado: "2026-03-02", ultimoAcesso: "2026-06-21", orgs: 1 },
  { userId: "u3", email: "dr.alves@clinicavida.com", criado: "2026-04-18", ultimoAcesso: "2026-06-23", orgs: 2 },
  { userId: "u4", email: "contato@bistrodapraca.com", criado: "2026-05-09", ultimoAcesso: "2026-05-30", orgs: 1 },
  { userId: "u5", email: "ana@techparts.com", criado: "2026-06-15", ultimoAcesso: "2026-06-22", orgs: 1 },
];
function demoOverview(orgs: AdminOrg[]): AdminOverview {
  const ativas = orgs.filter((o) => o.status === "active");
  const mrr = ativas.reduce((s, o) => s + o.mrr, 0);
  return {
    orgs: orgs.length, orgs_ativas: ativas.length,
    trials: orgs.filter((o) => o.status === "trial").length,
    inadimplentes: orgs.filter((o) => o.status === "past_due").length,
    usuarios: DEMO_USERS.length, usuarios_ativos: DEMO_USERS.filter((u) => (u.ultimoAcesso ?? "") >= "2026-05-24").length,
    mrr, arr: mrr * 12,
  };
}

/* ----------------------------- API ----------------------------- */
export async function isPlatformAdmin(): Promise<boolean> {
  if (isDemo) return true; // em demo, libera para visualizar o modo admin
  try { const { data } = await createClient().rpc("is_platform_admin"); return !!data; } catch (e) {
    reportar("admin.consulta", e, "o painel da plataforma abre sem os dados do cliente", true); return false; }
}

export async function getAdminOverview(): Promise<AdminOverview> {
  if (isDemo) return demoOverview(DEMO_ORGS);
  const { data, error } = await createClient().rpc("admin_overview");
  if (error) throw error;
  return data as AdminOverview;
}

export async function getAdminOrgs(): Promise<AdminOrg[]> {
  if (isDemo) return DEMO_ORGS;
  const { data, error } = await createClient().rpc("admin_orgs");
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    orgId: String(r.org_id), nome: String(r.nome ?? "—"), criado: String(r.criado ?? ""), membros: Number(r.membros ?? 0),
    plano: String(r.plano ?? "—"), status: (r.status as SubStatus) ?? "none", mrr: Number(r.mrr ?? 0),
    ultimoMov: r.ultimo_mov ? String(r.ultimo_mov) : null, movimentos: Number(r.movimentos ?? 0),
    expira: r.expira ? String(r.expira) : null,
    limiteLancamentos: r.limite_lancamentos == null ? null : Number(r.limite_lancamentos),
  }));
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  if (isDemo) return DEMO_USERS;
  const { data, error } = await createClient().rpc("admin_users");
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    userId: String(r.user_id), email: String(r.email ?? ""), criado: String(r.criado ?? ""),
    ultimoAcesso: r.ultimo_acesso ? String(r.ultimo_acesso) : null, orgs: Number(r.orgs ?? 0),
  }));
}

export async function getAdminPlans(): Promise<AdminPlan[]> {
  if (isDemo) return DEMO_PLANS;
  const { data, error } = await createClient().rpc("admin_plans");
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id), name: String(r.name ?? ""), priceMonth: Number(r.price_month ?? 0), active: !!r.active, assinantes: Number(r.assinantes ?? 0),
  }));
}

/**
 * Define plano e estado da assinatura.
 *
 * ⚠️ NÃO recebe MRR, e isso é o ponto. A tela já o derivava do preço do plano,
 * mas a função aceitava o número como parâmetro — a derivação era convenção de
 * tela, e convenção de tela se perde na primeira refatoração. Ninguém precisa
 * ser mal-intencionado para o número passar a mentir: basta um script de
 * correção em lote informar o valor "certo". Agora quem calcula é um gatilho
 * no banco, para todo caminho de escrita.
 */
export async function setSubscription(orgId: string, planId: string | null, status: SubStatus): Promise<void> {
  if (isDemo) return;
  const { error } = await createClient().rpc("admin_set_subscription", { p_org: orgId, p_plan: planId, p_status: status, p_period_end: null });
  if (error) throw new Error(error.message);
}

/* ----------------------------- crescimento + impersonação ----------------------------- */
export interface GrowthPonto { mes: string; novas: number; acumulado: number }
export interface OrgDetalhe {
  orgId: string; nome: string; criado: string; membros: number; contas: number;
  saldo: number; movimentos: number; ultimoMov: string | null;
  receita12m: number; despesa12m: number; plano: string; status: SubStatus; mrr: number;
  membrosLista: { email: string | null; role: string | null; nome: string | null }[];
}

const DEMO_GROWTH_NOVAS = [2, 1, 3, 2, 4, 3, 5, 4, 6, 5, 7, 4, 6]; // 13 meses sintéticos

function comAcumulado(novasPorMes: { mes: string; novas: number }[], base = 0): GrowthPonto[] {
  let acc = base;
  return novasPorMes.map((p) => { acc += p.novas; return { ...p, acumulado: acc }; });
}

export async function getAdminGrowth(): Promise<GrowthPonto[]> {
  if (isDemo) {
    const hoje = new Date();
    const pts = DEMO_GROWTH_NOVAS.map((novas, i) => {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - (12 - i), 1);
      return { mes: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, novas };
    });
    return comAcumulado(pts, 9); // base sintética anterior à janela
  }
  const { data, error } = await createClient().rpc("admin_growth");
  if (error) throw error;
  const pts = ((data ?? []) as Array<{ mes: string; novas: number }>).map((r) => ({ mes: String(r.mes), novas: Number(r.novas ?? 0) }));
  return comAcumulado(pts);
}

export async function getAdminOrgDetail(orgId: string): Promise<OrgDetalhe> {
  if (isDemo) {
    const org = DEMO_ORGS.find((o) => o.orgId === orgId) ?? DEMO_ORGS[0];
    const receita = Math.round(org.movimentos * 95);
    return {
      orgId: org.orgId, nome: org.nome, criado: org.criado, membros: org.membros, contas: 2 + (org.membros % 3),
      saldo: Math.round(receita * 0.22), movimentos: org.movimentos, ultimoMov: org.ultimoMov,
      receita12m: receita, despesa12m: Math.round(receita * 0.78), plano: org.plano, status: org.status, mrr: org.mrr,
      membrosLista: Array.from({ length: org.membros }, (_, i) => ({ email: `membro${i + 1}@${org.nome.toLowerCase().replace(/[^a-z]/g, "").slice(0, 8)}.com`, role: i === 0 ? "owner" : "member", nome: null })),
    };
  }
  const { data, error } = await createClient().rpc("admin_org_detail", { p_org: orgId });
  if (error) throw error;
  const r = (data ?? {}) as Record<string, unknown>;
  const membros = (r.membros_lista ?? []) as Array<{ email?: string; role?: string; nome?: string }>;
  return {
    orgId: String(r.org_id ?? orgId), nome: String(r.nome ?? "—"), criado: String(r.criado ?? ""),
    membros: Number(r.membros ?? 0), contas: Number(r.contas ?? 0), saldo: Number(r.saldo ?? 0),
    movimentos: Number(r.movimentos ?? 0), ultimoMov: r.ultimo_mov ? String(r.ultimo_mov) : null,
    receita12m: Number(r.receita_12m ?? 0), despesa12m: Number(r.despesa_12m ?? 0),
    plano: String(r.plano ?? "—"), status: (r.status as SubStatus) ?? "trial", mrr: Number(r.mrr ?? 0),
    membrosLista: membros.map((m) => ({ email: m.email ?? null, role: m.role ?? null, nome: m.nome ?? null })),
  };
}

/* ----------------------------- MRR histórico + auditoria + impersonação ----------------------------- */
export interface MrrPonto { mes: string; mrr: number; fonte: "snapshot" | "derivado" }
export interface AuditEvent { id: string; acao: string; alvo: string | null; detalhe: Record<string, unknown>; quando: string; adminEmail: string | null }

export async function getMrrHistory(): Promise<MrrPonto[]> {
  if (isDemo) {
    const hoje = new Date();
    let mrr = 980; // base sintética
    return Array.from({ length: 13 }, (_, i) => {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - (12 - i), 1);
      mrr = Math.round(mrr * (1 + (0.06 + (i % 3) * 0.015))); // crescimento ~6-9%/mês
      return { mes: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, mrr, fonte: "derivado" as const };
    });
  }
  const { data, error } = await createClient().rpc("admin_mrr_history");
  if (error) throw error;
  return ((data ?? []) as Array<{ mes: string; mrr: number; fonte: string }>).map((r) => ({ mes: String(r.mes), mrr: Number(r.mrr ?? 0), fonte: (r.fonte as "snapshot" | "derivado") ?? "derivado" }));
}

export async function captureMrr(): Promise<void> {
  if (isDemo) return;
  const { error } = await createClient().rpc("admin_capture_mrr");
  if (error) throw new Error(error.message);
}

export async function getAuditLog(): Promise<AuditEvent[]> {
  if (isDemo) {
    const now = Date.now();
    return [
      { id: "a1", acao: "subscription.set", alvo: "Bistrô da Praça", detalhe: { status: "past_due", mrr: 349 }, quando: new Date(now - 36e5).toISOString(), adminEmail: "voce@all4pay.com" },
      { id: "a2", acao: "impersonate", alvo: "Clínica Vida", detalhe: { email: "dr.alves@clinicavida.com" }, quando: new Date(now - 9e6).toISOString(), adminEmail: "voce@all4pay.com" },
      { id: "a3", acao: "plan.upsert", alvo: "Pro", detalhe: { price: 349 }, quando: new Date(now - 864e5).toISOString(), adminEmail: "voce@all4pay.com" },
    ];
  }
  const { data, error } = await createClient().rpc("admin_audit_log");
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id), acao: String(r.acao ?? ""), alvo: r.alvo ? String(r.alvo) : null,
    detalhe: (r.detalhe ?? {}) as Record<string, unknown>, quando: String(r.quando ?? ""), adminEmail: r.admin_email ? String(r.admin_email) : null,
  }));
}

export interface ImpersonateResult { ok: boolean; link?: string; email?: string; reason?: string }
export async function impersonar(orgId: string): Promise<ImpersonateResult> {
  if (isDemo) return { ok: false, reason: "Disponível em live (assume a sessão do owner via service role)." };
  try {
    const r = await fetch("/api/admin/impersonate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orgId }) }).then((x) => x.json());
    return r as ImpersonateResult;
  } catch (e) { return { ok: false, reason: (e as Error).message }; }
}

/* ----------------------------- detalhe cadastral do usuário ----------------------------- */
export interface UserOrgVinculo {
  orgId: string; nome: string; role: string; displayName: string | null; emailMembro: string | null; aprovaAte: number | null;
  perfil: Record<string, unknown> | null; // company_profiles.profile.db (representante, CNPJ, endereço…)
}
export interface UserDetalhe {
  userId: string; email: string | null; telefone: string | null; criado: string; ultimoAcesso: string | null;
  confirmado: boolean; anonimo: boolean; provedor: string; nomeMeta: string | null; telefoneMeta: string | null;
  orgs: UserOrgVinculo[];
}

export async function getAdminUserDetail(userId: string): Promise<UserDetalhe> {
  if (isDemo) {
    const u = DEMO_USERS.find((x) => x.userId === userId) ?? DEMO_USERS[0];
    const org = DEMO_ORGS[0];
    return {
      userId: u.userId, email: u.email, telefone: "+55 11 9" + String(80000000 + (u.userId.charCodeAt(0) * 7919) % 19999999),
      criado: u.criado, ultimoAcesso: u.ultimoAcesso, confirmado: true, anonimo: false, provedor: "email",
      nomeMeta: u.email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      telefoneMeta: null,
      orgs: [{
        orgId: org.orgId, nome: org.nome, role: "owner", displayName: u.email.split("@")[0], emailMembro: u.email, aprovaAte: 5000,
        perfil: { razaoSocial: org.nome + " Ltda", fantasia: org.nome, cnpj: "12.345.678/0001-90", repNome: "João da Silva", repEmail: u.email, repTelefone: "+55 11 98888-7777", repCpf: "123.456.789-00", cidade: "São Paulo", estado: "SP" },
      }],
    };
  }
  const { data, error } = await createClient().rpc("admin_user_detail", { p_user: userId });
  if (error) throw error;
  const r = (data ?? {}) as Record<string, unknown>;
  const orgs = (r.orgs ?? []) as Array<Record<string, unknown>>;
  return {
    userId: String(r.user_id ?? userId), email: r.email ? String(r.email) : null, telefone: r.telefone ? String(r.telefone) : null,
    criado: String(r.criado ?? ""), ultimoAcesso: r.ultimo_acesso ? String(r.ultimo_acesso) : null,
    confirmado: !!r.confirmado, anonimo: !!r.anonimo, provedor: String(r.provedor ?? "email"),
    nomeMeta: r.nome_meta ? String(r.nome_meta) : null, telefoneMeta: r.telefone_meta ? String(r.telefone_meta) : null,
    orgs: orgs.map((o) => ({
      orgId: String(o.org_id), nome: String(o.nome ?? "—"), role: String(o.role ?? "member"),
      displayName: o.display_name ? String(o.display_name) : null, emailMembro: o.email_membro ? String(o.email_membro) : null,
      aprovaAte: o.aprova_ate != null ? Number(o.aprova_ate) : null, perfil: (o.perfil ?? null) as Record<string, unknown> | null,
    })),
  };
}
