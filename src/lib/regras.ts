/**
 * Persistência das regras de categorização.
 *
 * Guarda em localStorage (demo-safe, síncrono — a importação precisa das regras
 * na hora, sem esperar rede). A ordem do array É a prioridade: a primeira regra
 * que casa vence, então mover para cima é como o dono resolve empate.
 *
 * Também mantém o CONTADOR de aplicações por regra, para a tela mostrar o que
 * está trabalhando e o que virou letra morta.
 */
import type { RegraCategorizacao } from "@/core/regras";
import { ler as lerOrg, gravar as gravarOrg } from "@/lib/store-org";

const CHAVE = "a4p_regras_categorizacao";
const CHAVE_USO = "a4p_regras_uso";

// ⚠️ Chave de NEGÓCIO (`CHAVES_ORG`): passa por `store-org`, nunca `localStorage.setItem` cru.
const ler = <T,>(chave: string, vazio: T): T => lerOrg<T>(chave, vazio) ?? vazio;
const gravar = (chave: string, v: unknown): void => gravarOrg(chave, v);

export function listarRegras(): RegraCategorizacao[] {
  return ler<RegraCategorizacao[]>(CHAVE, []);
}

export function salvarRegras(regras: RegraCategorizacao[]): void {
  gravar(CHAVE, regras);
}

/**
 * Adiciona (ou substitui pelo id). Regra nova entra no TOPO: normalmente o dono
 * acabou de criá-la para corrigir algo que as antigas classificavam errado.
 */
export function adicionarRegra(r: RegraCategorizacao): RegraCategorizacao[] {
  const atuais = listarRegras().filter((x) => x.id !== r.id);
  const nova = { ...r, criadaEm: r.criadaEm || new Date().toISOString().slice(0, 10) };
  const out = [nova, ...atuais];
  salvarRegras(out);
  return out;
}

export function removerRegra(id: string): RegraCategorizacao[] {
  const out = listarRegras().filter((r) => r.id !== id);
  salvarRegras(out);
  return out;
}

export function alternarRegra(id: string): RegraCategorizacao[] {
  const out = listarRegras().map((r) => (r.id === id ? { ...r, ativa: !r.ativa } : r));
  salvarRegras(out);
  return out;
}

/** Move a regra para cima/baixo — a ordem é a prioridade. */
export function moverRegra(id: string, dir: -1 | 1): RegraCategorizacao[] {
  const atuais = listarRegras();
  const i = atuais.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= atuais.length) return atuais;
  const out = [...atuais];
  [out[i], out[j]] = [out[j], out[i]];
  salvarRegras(out);
  return out;
}

/* ------------------------------- uso ------------------------------- */

export function usoDasRegras(): Record<string, number> {
  return ler<Record<string, number>>(CHAVE_USO, {});
}

/** Soma as aplicações desta rodada ao histórico. */
export function registrarUso(contagem: Record<string, number>): void {
  const atual = usoDasRegras();
  for (const [id, n] of Object.entries(contagem)) atual[id] = (atual[id] ?? 0) + n;
  gravar(CHAVE_USO, atual);
}

export function limparRegras(): void {
  gravar(CHAVE, []);
  gravar(CHAVE_USO, {});
}
