/**
 * A MARCA e o título da aba — puro, sem React.
 *
 * ⚠️ **Uma grafia só: `Quattro`.** A marca era `all4pay` até 30/09/2026 e
 * conviviam três grafias (`all4pay`, `All4Pay`, `All 4 Pay`). Trocar de nome
 * foi a chance de ter UMA: capitalizada, como nome próprio. O assistente é
 * **`Quattro AI`** — a única variação sancionada. A guarda de consistência
 * reprova qualquer grafia da marca antiga em texto de tela.
 *
 * ⚠️ **A tela vem PRIMEIRO no título da aba.** Quase todo o sistema anunciava
 * "Quattro — Tesouraria": Clientes, Produtos, Lixeira, DRE, Vendas e
 * Assinaturas, todos com o mesmo texto. Com dez abas abertas, histórico e
 * favoritos ficam indistinguíveis — e trabalhar com várias telas ao mesmo tempo
 * é exatamente o que um financeiro faz durante um fechamento. Com o prefixo na
 * frente, dez abas mostram dez vezes "Quattro —" e a parte que distingue fica
 * cortada na largura de uma aba.
 */

/** A grafia canônica da marca. Não escreva a marca à mão em outro lugar. */
export const MARCA = "Quattro";

/** O nome próprio do assistente — a única variação sancionada. */
export const MARCA_IA = "Quattro AI";

/** Monta o título no padrão `"<Tela> · Quattro"`. */
export const tituloDaAba = (tela?: string | null): string =>
  tela && tela.trim() ? `${tela.trim()} · ${MARCA}` : MARCA;
