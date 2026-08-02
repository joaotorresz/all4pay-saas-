/**
 * UFs e municípios (IBGE via BrasilAPI) — alimenta os selects de Estado e
 * Cidade do cadastro de empresa.
 *
 * A lista de UFs é ESTÁTICA (27 unidades, não muda) para o select nunca
 * depender de rede. Os municípios vêm da API, com cache por UF — são 5.570 no
 * país, e carregar só o estado escolhido evita trazer tudo à toa.
 *
 * Best-effort, igual à consulta de CNPJ: sem rede, devolve lista vazia e o
 * formulário segue utilizável (a cidade fica como veio do CNPJ).
 */

export interface UF {
  sigla: string;
  nome: string;
}

/** As 27 unidades federativas, em ordem alfabética de sigla. */
export const UFS: UF[] = [
  { sigla: "AC", nome: "Acre" }, { sigla: "AL", nome: "Alagoas" },
  { sigla: "AM", nome: "Amazonas" }, { sigla: "AP", nome: "Amapá" },
  { sigla: "BA", nome: "Bahia" }, { sigla: "CE", nome: "Ceará" },
  { sigla: "DF", nome: "Distrito Federal" }, { sigla: "ES", nome: "Espírito Santo" },
  { sigla: "GO", nome: "Goiás" }, { sigla: "MA", nome: "Maranhão" },
  { sigla: "MG", nome: "Minas Gerais" }, { sigla: "MS", nome: "Mato Grosso do Sul" },
  { sigla: "MT", nome: "Mato Grosso" }, { sigla: "PA", nome: "Pará" },
  { sigla: "PB", nome: "Paraíba" }, { sigla: "PE", nome: "Pernambuco" },
  { sigla: "PI", nome: "Piauí" }, { sigla: "PR", nome: "Paraná" },
  { sigla: "RJ", nome: "Rio de Janeiro" }, { sigla: "RN", nome: "Rio Grande do Norte" },
  { sigla: "RO", nome: "Rondônia" }, { sigla: "RR", nome: "Roraima" },
  { sigla: "RS", nome: "Rio Grande do Sul" }, { sigla: "SC", nome: "Santa Catarina" },
  { sigla: "SE", nome: "Sergipe" }, { sigla: "SP", nome: "São Paulo" },
  { sigla: "TO", nome: "Tocantins" },
];

const CHAVE = "a4p_municipios";
type Cache = Record<string, { t: number; m: string[] }>;
const VALIDADE_MS = 90 * 24 * 3600 * 1000; // a lista de municípios é estável

const memoria = new Map<string, string[]>();
const emVoo = new Map<string, Promise<string[]>>();

function lerCache(): Cache {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) || "{}") as Cache;
  } catch {
    return {};
  }
}

/**
 * Municípios de uma UF, em ordem alfabética. Devolve [] quando a UF é inválida
 * ou a rede falha — o chamador trata a lista vazia (cidade fica livre).
 */
export async function municipiosDe(uf: string): Promise<string[]> {
  const u = (uf || "").toUpperCase().trim();
  if (!UFS.some((x) => x.sigla === u)) return [];

  if (memoria.has(u)) return memoria.get(u) ?? [];
  if (typeof window !== "undefined") {
    const hit = lerCache()[u];
    if (hit && Date.now() - hit.t < VALIDADE_MS) {
      memoria.set(u, hit.m);
      return hit.m;
    }
  }
  const existente = emVoo.get(u);
  if (existente) return existente;

  const p = (async (): Promise<string[]> => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(`https://brasilapi.com.br/api/ibge/municipios/v1/${u}`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) return [];
      const j = (await res.json()) as { nome?: string }[];
      // A API devolve em CAIXA ALTA; capitaliza para exibir como nome próprio.
      const nomes = j
        .map((m) => capitalizar(String(m.nome ?? "")))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "pt-BR"));
      return nomes;
    } catch {
      return [];
    } finally {
      emVoo.delete(u);
    }
  })();

  emVoo.set(u, p);
  const nomes = await p;
  memoria.set(u, nomes);
  if (typeof window !== "undefined" && nomes.length > 0) {
    try {
      const c = lerCache();
      c[u] = { t: Date.now(), m: nomes };
      localStorage.setItem(CHAVE, JSON.stringify(c));
    } catch {
      /* cota cheia — segue sem cache */
    }
  }
  return nomes;
}

/** "SAO PAULO" → "São Paulo"; preserva as preposições em minúscula. */
export function capitalizar(s: string): string {
  const menores = new Set(["de", "da", "do", "das", "dos", "e", "d'"]);
  return (s || "")
    .toLocaleLowerCase("pt-BR")
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => (i > 0 && menores.has(w) ? w : w.charAt(0).toLocaleUpperCase("pt-BR") + w.slice(1)))
    .join(" ");
}
