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
export type CompanyIdentity = Partial<Record<string, string | boolean>>;

export interface StoredCompany {
  db?: CompanyIdentity;
  perfil?: PerfilEmpresa;
  participantes?: Participante[];
  estrutura?: Estrutura;
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
