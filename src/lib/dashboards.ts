/**
 * Persistência dos dashboards customizados — pela organização (`store-org`).
 *
 * ⚠️ **GRAVAVA DIRETO NO `localStorage`, por fora do `store-org`.** A chave
 * (`a4p_dashboards_custom`) está classificada como dado de NEGÓCIO em
 * `CHAVES_ORG`, o que tem duas consequências quando o escritor desvia:
 *   1. a edição nunca sobe ao servidor — o painel "Empresa" (que a tela diz
 *      ser "compartilhado com a organização") só existia neste navegador;
 *   2. na hidratação "o servidor vence" (store-org): a cópia que a migração
 *      inicial subiu volta e SOBRESCREVE as edições locais da sessão
 *      seguinte. O painel montado sumia ao trocar de máquina — ou ao abrir de
 *      novo na mesma.
 * Agora a leitura e a escrita passam por `ler`/`gravar` do `store-org`, como as
 * outras chaves de negócio.
 *
 * ⚠️ **"Pessoal" continua pessoal.** Com o estado na organização, um painel
 * pessoal ficaria visível para os colegas; ele passa a guardar o `dono` e a
 * lista o esconde de quem não é o dono (`visiveisPara`).
 */
import type { DashboardCustom } from "@/core/dashboards";
import { ler, gravar as gravarOrg, CHAVES_ORG } from "@/lib/store-org";
import { isDemo } from "@/lib/demo";

const CHAVE = CHAVES_ORG.dashboardsCustom;

export function listarDashboards(): DashboardCustom[] {
  if (typeof window === "undefined") return [];
  const v = ler<DashboardCustom[]>(CHAVE, []);
  return Array.isArray(v) ? v : [];
}

// ⚠️ Chave de NEGÓCIO (`CHAVES_ORG`): passa por `store-org`, nunca `localStorage.setItem` cru.
function gravar(lista: DashboardCustom[]): void {
  if (typeof window === "undefined") return;
  gravarOrg(CHAVE, lista);
}

/** Quem está usando — para separar o pessoal do de empresa. Demo: "local". */
export async function usuarioAtualId(): Promise<string> {
  if (isDemo) return "local";
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const { data } = await createClient().auth.getUser();
    return data.user?.id ?? "local";
  } catch {
    return "local";
  }
}

/** O de empresa aparece para todos; o pessoal, só para o dono (sem dono = legado, aparece). */
export function visiveisPara(lista: DashboardCustom[], eu: string): DashboardCustom[] {
  return lista.filter((d) => d.escopo !== "pessoal" || !d.dono || d.dono === eu);
}

export const dashboardPorId = (id: string): DashboardCustom | null =>
  listarDashboards().find((d) => d.id === id) ?? null;

/** Cria ou atualiza pelo id; devolve a lista já ordenada (mais recente primeiro). */
export function salvarDashboard(d: DashboardCustom, eu?: string): DashboardCustom[] {
  const hoje = new Date().toISOString().slice(0, 10);
  const atual = listarDashboards().filter((x) => x.id !== d.id);
  const out = [{ ...d, criadoEm: d.criadoEm || hoje, dono: d.dono ?? eu }, ...atual];
  gravar(out);
  return out;
}

export function removerDashboard(id: string): DashboardCustom[] {
  const out = listarDashboards().filter((d) => d.id !== id);
  gravar(out);
  return out;
}

/** Duplica ("Salvar como…"): mesmo conteúdo, id novo e nome marcado como cópia. */
export function duplicarDashboard(id: string, nome: string): DashboardCustom | null {
  const orig = dashboardPorId(id);
  if (!orig) return null;
  const copia: DashboardCustom = {
    ...orig,
    id: `d_${Date.now().toString(36)}`,
    nome: nome || `${orig.nome} (cópia)`,
    criadoEm: "",
  };
  salvarDashboard(copia);
  return copia;
}
