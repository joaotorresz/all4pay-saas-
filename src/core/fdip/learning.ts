/**
 * Self-Learning Engine — toda confirmação do usuário vira treinamento.
 * Memoriza contraparteNorm → categoria; na próxima importação a confiança
 * sobe para ~99%. Persistido em localStorage (por enquanto), pronto para
 * virar tabela cross-tenant em produção.
 */
import { ler as lerOrg, gravar as gravarOrg } from "@/lib/store-org";
const KEY = "a4p_fdip_memory";

type Memoria = Record<string, string>; // contraparteNorm -> categoria

// ⚠️ Chave de NEGÓCIO (`CHAVES_ORG`): passa por `store-org`, nunca `localStorage.setItem` cru.
function ler(): Memoria {
  return { ...lerOrg<Memoria>(KEY, {}) };
}

export function memoriaDe(norm: string): string | null {
  return ler()[norm] ?? null;
}

export function aprender(norm: string, categoria: string): void {
  if (typeof window === "undefined") return;
  const m = ler();
  m[norm] = categoria;
  gravarOrg(KEY, m);
}

export function totalAprendido(): number {
  return Object.keys(ler()).length;
}
