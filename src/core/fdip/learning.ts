/**
 * Self-Learning Engine — toda confirmação do usuário vira treinamento.
 * Memoriza contraparteNorm → categoria; na próxima importação a confiança
 * sobe para ~99%. Persistido em localStorage (por enquanto), pronto para
 * virar tabela cross-tenant em produção.
 */
const KEY = "a4p_fdip_memory";

type Memoria = Record<string, string>; // contraparteNorm -> categoria

function ler(): Memoria {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

export function memoriaDe(norm: string): string | null {
  return ler()[norm] ?? null;
}

export function aprender(norm: string, categoria: string): void {
  if (typeof window === "undefined") return;
  const m = ler();
  m[norm] = categoria;
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

export function totalAprendido(): number {
  return Object.keys(ler()).length;
}
