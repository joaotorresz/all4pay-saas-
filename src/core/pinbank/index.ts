/**
 * A maquininha da PINBANK no ERP — puro, tipado, sem I/O.
 *
 * Toda venda, cancelamento e estorno numa maquininha vinculada a uma empresa
 * chega pelo webhook `Compra.*` e vira, no MESMO desenho da venda de maquininha
 * (`core/vendas/pos`): o documento em `sales_docs` + por parcela a receita bruta
 * a receber e a taxa a pagar, na data estimada do repasse.
 *
 *   · `evento.ts` — lê o envelope, tira o dado sensível, traduz a transação e
 *     consolida o status (evento fora de ordem não volta o ciclo);
 *   · `plano.ts`  — decide o que o evento FAZ (lançar, desfazer, registrar ou
 *     esperar o vínculo), sem gravar nada.
 */
export const PINBANK_VERSION = "pinbank/1.0.0";

export * from "./evento";
export * from "./plano";
