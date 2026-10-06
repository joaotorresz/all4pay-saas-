/**
 * Self-Learning Engine — toda confirmação do usuário vira treinamento.
 * Memoriza contraparteNorm → categoria; na próxima importação a confiança
 * sobe para ~99%. Persistido em localStorage (por enquanto), pronto para
 * virar tabela cross-tenant em produção.
 */
import { ler as lerOrg, gravar as gravarOrg } from "@/lib/store-org";
import { sanearContraparte } from "@/core/ingestao/contraparte";
import { normalizarDescritivo } from "@/core/ingestao/chave";
const KEY = "a4p_fdip_memory";

/**
 * ⚠️ A CHAVE DA MEMÓRIA — uma só, para quem APRENDE (a correção na revisão, a
 * IA do Puzzlebot) e para quem LÊ (`classificarRecord`).
 *
 * Era a contraparte normalizada, e o extrato tira dela a marca e o meio de
 * pagamento: "TARIFA CIELO", "TARIFA PIX" e "TARIFA BOLETO" viram todas
 * "tarifa". Corrigir a primeira para "Tarifas de adquirência" gravava
 * "tarifa" → taxa da maquininha, e TODA tarifa bancária do extrato seguinte
 * subia para a despesa variável, acima do EBITDA — achado da revisão
 * adversarial, que a regra sugerida já não fazia e a memória continuava
 * fazendo. Quando a contraparte não identifica ninguém (palavra de cobrança,
 * vazia), a chave é o DESCRITIVO inteiro normalizado, que ainda tem a marca
 * ("tarifa cielo"): a memória vale para aquela linha, não para a palavra.
 * Contraparte que identifica alguém continua com a chave de sempre — a memória
 * já gravada segue valendo.
 */
export function chaveDaMemoria(r: { contraparteNorm?: string | null; contraparte?: string | null; descricao?: string | null }): string {
  const norm = (r.contraparteNorm ?? "").trim();
  if (norm && sanearContraparte(norm).ehPessoa) return norm;
  const descritivo = r.descricao || r.contraparte || "";
  return `descritivo:${normalizarDescritivo(r.contraparte ? `${r.contraparte} ${descritivo}` : descritivo)}`;
}

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
