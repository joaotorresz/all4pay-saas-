/**
 * Modo Administrador da plataforma (super-admin) — visão CROSS-TENANT do dono do
 * SaaS: orgs/usuários, ativos, MRR e cobrança de mensalidades. **live**: RPCs
 * SECURITY DEFINER do 0014 (gateadas por `is_platform_admin()`); **demo**: dados
 * sintéticos determinísticos (para visualizar sem ser admin real).
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";

export interface AdminOverview {
  orgs: number; orgs_ativas: number; trials: number; inadimplentes: number;
  usuarios: number; usuarios_ativos: number; mrr: number; arr: number;
}
export type SubStatus = "trial" | "active" | "past_due" | "canceled";
export interface AdminOrg {
  orgId: string; nome: string; criado: string; membros: number;
  plano: string; status: SubStatus; mrr: number; ultimoMov: string | null; movimentos: number;
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
  { orgId: "o1", nome: "Açaí do Porto Ltda", criado: "2026-02-11", membros: 4, plano: "Pro", status: "active", mrr: 349, ultimoMov: "2026-06-22", movimentos: 1280 },
  { orgId: "o2", nome: "Studio Marcenaria", criado: "2026-03-02", membros: 2, plano: "Starter", status: "active", mrr: 149, ultimoMov: "2026-06-20", movimentos: 642 },
  { orgId: "o3", nome: "Clínica Vida", criado: "2026-04-18", membros: 6, plano: "Enterprise", status: "active", mrr: 990, ultimoMov: "2026-06-23", movimentos: 3104 },
  { orgId: "o4", nome: "Bistrô da Praça", criado: "2026-05-09", membros: 3, plano: "Pro", status: "past_due", mrr: 349, ultimoMov: "2026-06-01", movimentos: 410 },
  { orgId: "o5", nome: "TechParts Imports", criado: "2026-06-15", membros: 1, plano: "—", status: "trial", mrr: 0, ultimoMov: "2026-06-23", movimentos: 88 },
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
  try { const { data } = await createClient().rpc("is_platform_admin"); return !!data; } catch { return false; }
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
    plano: String(r.plano ?? "—"), status: (r.status as SubStatus) ?? "trial", mrr: Number(r.mrr ?? 0),
    ultimoMov: r.ultimo_mov ? String(r.ultimo_mov) : null, movimentos: Number(r.movimentos ?? 0),
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

export async function setSubscription(orgId: string, planId: string | null, status: SubStatus, mrr: number): Promise<void> {
  if (isDemo) return;
  const { error } = await createClient().rpc("admin_set_subscription", { p_org: orgId, p_plan: planId, p_status: status, p_mrr: mrr, p_period_end: null });
  if (error) throw new Error(error.message);
}
