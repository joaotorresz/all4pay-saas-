/**
 * Perfil da empresa salvo localmente no onboarding (a4p_company) + leitura do
 * nome da organização no Supabase (RLS: cada usuário lê só a própria org).
 * Não há tabela para perfil/governança ainda — esta é a camada de consumo do
 * que o wizard coletou, sem tocar no schema.
 */
import { createClient } from "@/lib/supabase/client";
import { isDemo } from "@/lib/demo";
import type { PerfilEmpresa, Participante, Estrutura } from "@/core/onboarding";

const KEY = "a4p_company";

/** Identidade jurídica (campos do passo 1 do wizard; tudo opcional). */
export type CompanyIdentity = Partial<Record<string, string | boolean>> & {
  /** Empresa (PJ) × Pessoa Física (PF) — escolhido no login/cadastro. */
  tipoConta?: "empresa" | "pessoal";
};

/** Dados específicos do modo Pessoa Física (controle de gastos do dia a dia). */
export interface PerfilPessoal {
  nome?: string;
  rendaMensal?: number;
  saldoInicial?: number;
  orcamentoMensal?: number;
  carteiras?: string[];
  categoriasGasto?: string[];
}

export interface StoredCompany {
  db?: CompanyIdentity;
  perfil?: PerfilEmpresa;
  participantes?: Participante[];
  estrutura?: Estrutura;
  /** Preenchido só no modo Pessoa Física. */
  pessoal?: PerfilPessoal;
}

export function loadCompany(): StoredCompany | null {
  if (typeof window === "undefined") return null;
  try {
    const s = localStorage.getItem(KEY);
    return s ? (JSON.parse(s) as StoredCompany) : null;
  } catch {
    return null;
  }
}

export function saveCompany(c: StoredCompany): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

/** Perfil efetivo: demo → cache local; live → `company_profiles` da org (RLS),
 *  com fallback no cache. Hidrata o cache local para a próxima pintura. */
export async function fetchCompany(): Promise<StoredCompany | null> {
  if (isDemo) return loadCompany();
  try {
    const { data, error } = await createClient().from("company_profiles").select("profile").maybeSingle();
    if (error || !data?.profile) return loadCompany();
    const c = data.profile as StoredCompany;
    saveCompany(c); // cache local
    return c;
  } catch { return loadCompany(); }
}

/** Persiste o perfil: cache local + (live) upsert na linha única da org em
 *  `company_profiles` (update-then-insert; org_id default = auth_org_id()). */
export async function persistCompany(c: StoredCompany): Promise<void> {
  saveCompany(c);
  if (isDemo) return;
  const s = createClient();
  const { data, error } = await s
    .from("company_profiles")
    .update({ profile: c, updated_at: new Date().toISOString() })
    .select("org_id");
  if (error) throw error;
  if (!data || data.length === 0) {
    const { error: insErr } = await s.from("company_profiles").insert({ profile: c });
    if (insErr) throw insErr;
  }
}

/** Nome da organização atual (live). Demo/sem login → null. */
export async function getOrganizationName(): Promise<string | null> {
  if (isDemo) return null;
  try {
    const s = createClient();
    const { data } = await s.from("organizations").select("name").limit(1).maybeSingle();
    return (data as { name?: string } | null)?.name ?? null;
  } catch {
    return null;
  }
}
