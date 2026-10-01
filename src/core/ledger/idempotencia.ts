/**
 * IDEMPOTÊNCIA QUE DIZ A VERDADE — a decisão de postar um lançamento com chave.
 *
 * ⚠️ **"Já existia" não é "postado", e "já existia com OUTRO valor" é um
 * terceiro caso.** A postagem com `externalKey` (cronograma do mês, provisão,
 * reconhecimento de receita) era idempotente em silêncio: a segunda chamada
 * voltava sem fazer nada e a tela anunciava "Lançado no razão". Medido na
 * demonstração: lançar a depreciação de outubro, mudar a parcela de um
 * cronograma e lançar de novo — a tela dizia "Lançado" e o razão continuava
 * com o valor ANTIGO. E não havia saída: mesmo estornado o original, a chave
 * continuava ocupada e o valor certo nunca mais entrava.
 *
 * Agora, para a mesma chave:
 *   - um lançamento VIVO com o mesmo total  → "ja_existia" (nada duplica, e a
 *     tela diz isso);
 *   - um lançamento VIVO com outro total    → CONFLITO, recusado com o valor
 *     que está lá e o caminho (estornar no Razão e lançar de novo);
 *   - todos os anteriores ESTORNADOS        → posta com a chave versionada
 *     (`<chave>#v2`, `#v3`…) — o índice único do banco continua valendo.
 */

export interface LancamentoComChave {
  chave: string;
  /** Soma dos débitos — o "valor" de um lançamento balanceado. */
  total: number;
  estornado: boolean;
}

export type DecisaoPostagem =
  | { acao: "postar"; chave?: string }
  | { acao: "ja_existia" }
  | { acao: "conflito"; valorExistente: number };

/** A chave e as suas versões (`chave#v2`…) — e nada que só COMECE igual. */
export const mesmaChave = (chave: string, outra: string): boolean =>
  outra === chave || (outra.startsWith(`${chave}#v`) && /^\d+$/.test(outra.slice(chave.length + 2)));

export function decidirPostagem(chave: string | undefined, total: number, existentes: readonly LancamentoComChave[]): DecisaoPostagem {
  if (!chave) return { acao: "postar" };
  const daChave = existentes.filter((e) => mesmaChave(chave, e.chave));
  const vivos = daChave.filter((e) => !e.estornado);
  if (vivos.some((v) => Math.abs(v.total - total) < 0.005)) return { acao: "ja_existia" };
  if (vivos.length) return { acao: "conflito", valorExistente: vivos[0].total };
  return { acao: "postar", chave: daChave.length ? `${chave}#v${daChave.length + 1}` : chave };
}
