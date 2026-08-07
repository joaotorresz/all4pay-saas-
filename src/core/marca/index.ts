/**
 * A MARCA e o título da aba — puro, sem React.
 *
 * ⚠️ **Uma grafia só.** Conviviam três dentro do mesmo produto: `all4pay`,
 * `All4Pay` e `All 4 Pay`. A canônica é **`all4pay`**, minúscula, como no
 * wordmark. O assistente tem nome próprio — **`All 4 Pay AI`** — e é a única
 * exceção sancionada.
 *
 * ⚠️ **A tela vem PRIMEIRO no título da aba.** Quase todo o sistema anunciava
 * "all4pay — Tesouraria": Clientes, Produtos, Lixeira, DRE, Vendas e
 * Assinaturas, todos com o mesmo texto. Com dez abas abertas, histórico e
 * favoritos ficam indistinguíveis — e trabalhar com várias telas ao mesmo tempo
 * é exatamente o que um financeiro faz durante um fechamento. Com o prefixo na
 * frente, dez abas mostram dez vezes "all4pay —" e a parte que distingue fica
 * cortada na largura de uma aba.
 */

/** A grafia canônica da marca. Não escreva a marca à mão em outro lugar. */
export const MARCA = "all4pay";

/** O nome próprio do assistente — a única variação sancionada. */
export const MARCA_IA = "All 4 Pay AI";

/** Monta o título no padrão `"<Tela> · all4pay"`. */
export const tituloDaAba = (tela?: string | null): string =>
  tela && tela.trim() ? `${tela.trim()} · ${MARCA}` : MARCA;
