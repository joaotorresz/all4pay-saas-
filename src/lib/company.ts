/**
 * Perfil da empresa salvo localmente no onboarding (a4p_company) + leitura do
 * nome da organização no Supabase (RLS: cada usuário lê só a própria org).
 * Não há tabela para perfil/governança ainda — esta é a camada de consumo do
 * que o wizard coletou, sem tocar no schema.
 */
import { createClient } from "@/lib/supabase/client";
import { isDemo } from "@/lib/demo";
import type { PerfilEmpresa, Participante, Estrutura } from "@/core/onboarding";
import { TETO_LINHAS } from "@/lib/supabase/consulta";
import { reportar } from "@/lib/erros";
import { ler as lerOrg, gravar as gravarOrg, organizacaoAtivaDoServidor } from "@/lib/store-org";

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
  /**
   * A ORGANIZAÇÃO dona deste perfil — o carimbo do cache. Sem ele, o cache do
   * navegador era devolvido para qualquer empresa aberta nele.
   */
  orgId?: string;
}

// ⚠️ Chave de NEGÓCIO (`CHAVES_ORG`): passa por `store-org`, nunca `localStorage.setItem` cru.
// O perfil da empresa gravado cru nunca subia ao servidor: outra máquina (ou o
// contador) abria a empresa sem regime tributário, e o imposto saía do padrão.
export function loadCompany(): StoredCompany | null {
  return lerOrg<StoredCompany | null>(KEY, null);
}

export function saveCompany(c: StoredCompany): void {
  gravarOrg(KEY, c);
}

/**
 * O cache só vale para a organização que o gravou.
 *
 * ⚠️ **Antes, sem perfil no servidor (ou com erro), `fetchCompany` devolvia o
 * cache do navegador — que podia ser de OUTRA empresa** (a aberta antes no
 * mesmo navegador, ou a de outro usuário que usou a máquina). A tela mostrava
 * a razão social, o CNPJ e o regime de uma empresa dentro de outra: a aparência
 * exata de um vazamento, e a origem de um imposto calculado no regime errado.
 * Cache sem carimbo, ou com o carimbo de outra organização, é tratado como
 * AUSENTE — "não há perfil" é verdade; o perfil de outra empresa não é.
 */
export function cacheDaOrganizacao(cache: StoredCompany | null, orgAtiva: string | null): StoredCompany | null {
  if (!cache || !orgAtiva) return null;
  return cache.orgId === orgAtiva ? cache : null;
}


/** Perfil efetivo: demo → cache local; live → `company_profiles` da org (RLS),
 *  com fallback no cache SÓ quando ele é da organização aberta. Hidrata o cache
 *  local (carimbado com a organização) para a próxima pintura. */
export async function fetchCompany(): Promise<StoredCompany | null> {
  if (isDemo) return loadCompany();
  const s = createClient();
  try {
    const { data, error } = await s.from("company_profiles").select("org_id,profile").maybeSingle();
    if (error) throw error;
    const linha = data as { org_id?: string; profile?: StoredCompany } | null;
    if (linha?.profile) {
      const c: StoredCompany = { ...linha.profile, ...(linha.org_id ? { orgId: linha.org_id } : {}) };
      saveCompany(c); // cache local, carimbado
      return c;
    }
  } catch (e) {
    reportar("cadastro.empresa", e, "os dados da empresa não carregam do servidor; o cache só é usado se for da empresa aberta", true);
  }
  try {
    return cacheDaOrganizacao(loadCompany(), await organizacaoAtivaDoServidor());
  } catch (e) {
    // Sem saber qual empresa está aberta, nenhum cache é confiável.
    reportar("cadastro.empresa", e, "sem saber a empresa aberta, o cadastro em cache não é mostrado e a tela pede o cadastro de novo", true);
    return null;
  }
}

/** Persiste o perfil: cache local + (live) upsert na linha única da org em
 *  `company_profiles` (update-then-insert; org_id default = auth_org_id()). */
export async function persistCompany(c: StoredCompany): Promise<void> {
  // O cache local primeiro (as telas leem síncrono); o carimbo da organização
  // só entra depois que o SERVIDOR diz de qual empresa é a linha.
  const { orgId: _carimbo, ...perfil } = c;
  void _carimbo;
  saveCompany(perfil);
  if (isDemo) return;
  const s = createClient();
  const { data, error } = await s
    .from("company_profiles")
    .update({ profile: perfil, updated_at: new Date().toISOString() })
    .select("org_id").limit(TETO_LINHAS);
  if (error) throw error;
  let orgId = (data as { org_id?: string }[] | null)?.[0]?.org_id ?? null;
  if (!data || data.length === 0) {
    const { data: ins, error: insErr } = await s.from("company_profiles").insert({ profile: perfil }).select("org_id").maybeSingle();
    if (insErr) throw insErr;
    orgId = (ins as { org_id?: string } | null)?.org_id ?? null;
  }
  saveCompany({ ...perfil, ...(orgId ? { orgId } : {}) });
}

/** Nome da organização atual (live). Demo/sem login → null. */
export async function getOrganizationName(): Promise<string | null> {
  if (isDemo) return null;
  try {
    const s = createClient();
    const { data } = await s.from("organizations").select("name").limit(1).maybeSingle();
    return (data as { name?: string } | null)?.name ?? null;
  } catch (e) {
    reportar("cadastro.empresa", e, "os dados da empresa não carregam e a tela pede o cadastro de novo", true);
    return null;
  }
}
