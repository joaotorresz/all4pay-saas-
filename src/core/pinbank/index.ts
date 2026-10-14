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
 *     esperar o vínculo), sem gravar nada;
 *   · `extrato-pos.ts` — monta o pedido do extrato consolidado (`ExtratoPos`)
 *     e lê a resposta sem dado pessoal: a data real do repasse e a taxa
 *     (o MDR, em percentual → pontos-base);
 *   · `conferencia.ts` — casa cada parcela do extrato com o título que o
 *     sistema lançou (NSU + parcela) e diz o que diverge — e, num eixo à
 *     parte, compara o MDR do extrato (percentual) com a taxa contratada.
 *     Só leitura;
 *   · `conferencia-portoes.ts` — os portões da rota da conferência: o teto das
 *     leituras, a leitura da reserva que o BANCO faz da espera por empresa
 *     (falha fechada), quanto o botão espera (no 429, o número do banco) e só
 *     as contagens de cada lado sem venda em comum ATESTADA pelo aviso da
 *     Pinbank.
 */
export const PINBANK_VERSION = "pinbank/1.0.0";

export * from "./evento";
export * from "./plano";
export * from "./extrato-pos";
export * from "./conferencia";
export * from "./conferencia-portoes";
