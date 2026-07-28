/**
 * Consulta de CNPJ — razão social + CNAE principal (BrasilAPI, pública e sem
 * chave). É a ponte entre "PIX 12.345.678/0001-90" no extrato e "posto de
 * combustível" no seu plano de contas.
 *
 * Regras da camada:
 *  • CACHE agressivo (localStorage): o mesmo fornecedor aparece dezenas de
 *    vezes num extrato — consulta-se UMA vez. Cache com validade de 60 dias.
 *  • Best-effort: rede é opcional. Falhou/off-line/demo → devolve null e o
 *    sistema segue com a classificação por palavra-chave (nunca quebra o import).
 *  • Concorrência limitada e falha memorizada — não martela a API.
 */
import { categoriaPorCNAE, cnpjValido, type ResultadoCNAE } from "@/core/cnae";

export interface DadosCNPJ {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string;
  cnaePrincipal: string;
  cnaeDescricao: string;
  municipio?: string;
  uf?: string;
  /** A categoria sugerida a partir do CNAE (o motor puro). */
  sugestao: ResultadoCNAE | null;
}

const CHAVE = "a4p_cnpj_cache";
const VALIDADE_MS = 60 * 24 * 3600 * 1000; // 60 dias
type Entrada = { t: number; d: DadosCNPJ | null };

function lerCache(): Record<string, Entrada> {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) || "{}") as Record<string, Entrada>;
  } catch {
    return {};
  }
}
function gravarCache(c: Record<string, Entrada>): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(c));
  } catch {
    /* cota cheia — seguir sem cache */
  }
}

/** Cache em memória da sessão (evita reler/reparsear o localStorage no loop). */
const memoria = new Map<string, DadosCNPJ | null>();
/** Promessas em voo — duas linhas do mesmo CNPJ compartilham a consulta. */
const emVoo = new Map<string, Promise<DadosCNPJ | null>>();

/**
 * Consulta um CNPJ. Devolve null quando inválido, sem rede ou não encontrado —
 * o chamador SEMPRE precisa tratar null (a classificação por palavra-chave é o
 * fallback natural).
 */
export async function consultarCNPJ(cnpjEntrada: string): Promise<DadosCNPJ | null> {
  const cnpj = (cnpjEntrada || "").replace(/\D/g, "");
  if (!cnpjValido(cnpj)) return null;

  if (memoria.has(cnpj)) return memoria.get(cnpj) ?? null;

  if (typeof window !== "undefined") {
    const cache = lerCache();
    const hit = cache[cnpj];
    if (hit && Date.now() - hit.t < VALIDADE_MS) {
      memoria.set(cnpj, hit.d);
      return hit.d;
    }
  }

  const existente = emVoo.get(cnpj);
  if (existente) return existente;

  const p = (async (): Promise<DadosCNPJ | null> => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      const j = (await res.json()) as Record<string, unknown>;
      const codigo = String(j.cnae_fiscal ?? "");
      const dados: DadosCNPJ = {
        cnpj,
        razaoSocial: String(j.razao_social ?? ""),
        nomeFantasia: (j.nome_fantasia as string) || undefined,
        cnaePrincipal: codigo,
        cnaeDescricao: String(j.cnae_fiscal_descricao ?? ""),
        municipio: (j.municipio as string) || undefined,
        uf: (j.uf as string) || undefined,
        sugestao: categoriaPorCNAE(codigo),
      };
      return dados;
    } catch {
      return null; // rede indisponível/timeout — segue sem enriquecer
    } finally {
      emVoo.delete(cnpj);
    }
  })();

  emVoo.set(cnpj, p);
  const dados = await p;

  memoria.set(cnpj, dados);
  if (typeof window !== "undefined") {
    const cache = lerCache();
    cache[cnpj] = { t: Date.now(), d: dados };
    gravarCache(cache);
  }
  return dados;
}

/**
 * Consulta vários CNPJs com concorrência limitada (a BrasilAPI é pública e tem
 * rate limit). Devolve um mapa cnpj → dados; ausentes = não resolvidos.
 */
export async function consultarCNPJs(
  cnpjs: string[],
  concorrencia = 4,
): Promise<Map<string, DadosCNPJ>> {
  const unicos = Array.from(new Set(cnpjs.map((c) => (c || "").replace(/\D/g, "")).filter(cnpjValido)));
  const out = new Map<string, DadosCNPJ>();
  let i = 0;
  const worker = async (): Promise<void> => {
    while (i < unicos.length) {
      const cnpj = unicos[i++];
      const d = await consultarCNPJ(cnpj);
      if (d) out.set(cnpj, d);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concorrencia, unicos.length) }, worker));
  return out;
}

/** Limpa o cache de consultas (usado no "limpar dados importados"). */
export function limparCacheCNPJ(): void {
  memoria.clear();
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    /* ignore */
  }
}
