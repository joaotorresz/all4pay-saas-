/**
 * Persistência dos dashboards customizados (localStorage, demo-safe).
 *
 * Guarda a lista inteira sob uma chave só: são poucos objetos e pequenos, e
 * ler/gravar tudo de uma vez evita estado meio-salvo entre chaves separadas.
 * Sincronizar por organização é evolução futura — o formato já é serializável.
 */
import type { DashboardCustom } from "@/core/dashboards";
import { ler as lerOrg, gravar as gravarOrg } from "@/lib/store-org";

const CHAVE = "a4p_dashboards_custom";

export function listarDashboards(): DashboardCustom[] {
  return lerOrg<DashboardCustom[]>(CHAVE, []);
}

// ⚠️ Chave de NEGÓCIO (`CHAVES_ORG`): passa por `store-org`, nunca `localStorage.setItem` cru.
function gravar(lista: DashboardCustom[]): void {
  gravarOrg(CHAVE, lista);
}

export const dashboardPorId = (id: string): DashboardCustom | null =>
  listarDashboards().find((d) => d.id === id) ?? null;

/** Cria ou atualiza pelo id; devolve a lista já ordenada (mais recente primeiro). */
export function salvarDashboard(d: DashboardCustom): DashboardCustom[] {
  const hoje = new Date().toISOString().slice(0, 10);
  const atual = listarDashboards().filter((x) => x.id !== d.id);
  const out = [{ ...d, criadoEm: d.criadoEm || hoje }, ...atual];
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
