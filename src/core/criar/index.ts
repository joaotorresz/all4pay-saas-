/**
 * O CATÁLOGO DE CRIAÇÃO — as ações do painel "Criar".
 *
 * Puro e sem React de propósito: é ele que a matriz de consistência confere.
 * A tela que o desenha é `components/app/CriarNovo.tsx`.
 */

/**
 * ⚠️ **A REGRA DE MODAL × PÁGINA**, que antes não existia.
 *
 * "Novo cliente" abria um modal sobre a lista; "Nova venda" abandonava a tela e
 * ia para `/dashboard/sales-invoices/new`. Sem regra visível, o usuário nunca
 * sabia se ia perder o contexto ao clicar — e perder contexto no meio de um
 * fechamento custa a retomada inteira.
 *
 * A regra:
 *  - **MODAL** para cadastro simples: um formulário, poucos campos, nada que
 *    dependa de outra tela. Cliente, fornecedor, produto, categoria.
 *  - **PÁGINA** para documento composto: tem itens, totais, impostos, rateio —
 *    coisas que precisam de espaço e às vezes de várias sessões. Venda, compra,
 *    orçamento, contrato.
 *
 * O critério é o TAMANHO DO FORMULÁRIO, não o gosto de quem implementou. E cada
 * item declara o seu `forma`, então a diferença fica visível no código e
 * anunciada na tela.
 */
export type FormaDeCriar = "modal" | "pagina";

export interface Acao {
  label: string;
  icon: string;
  /**
   * ⚠️ TODA ação tem `rota` — inclusive as de modal. É o que permite abrir em
   * nova aba, usar Ctrl/Cmd+clique e compartilhar o endereço. Antes eram todas
   * `<button>` com navegação por código: dezesseis ações e nenhum endereço.
   */
  rota: string;
  forma: FormaDeCriar;
  /** Modal a abrir quando `forma === "modal"` e já se está no app. */
  modal?: string;
}

/**
 * As rotas `?novo=<x>` abrem a tela do assunto JÁ com o formulário aberto. É o
 * que dá endereço compartilhável a um modal — "manda o link de nova venda" é um
 * pedido corriqueiro, e antes não tinha resposta.
 */
export const ACOES_CADASTROS: Acao[] = [
  { label: "Novo cliente", icon: "users", rota: "/cadastros?aba=clientes&novo=1", forma: "modal", modal: "cliente" },
  { label: "Novo fornecedor", icon: "building", rota: "/cadastros?aba=fornecedores&novo=1", forma: "modal", modal: "fornecedor" },
  { label: "Novo produto", icon: "b", rota: "/cadastros?aba=produtos&novo=1", forma: "modal", modal: "produto" },
  { label: "Nova conta bancária", icon: "credit-card", rota: "/dashboard/registrations/bank-accounts?novo=1", forma: "pagina" },
  { label: "Nova categoria", icon: "database", rota: "/dashboard/registrations/chart-of-accounts?novo=1", forma: "pagina" },
  { label: "Novo projeto", icon: "target", rota: "/dashboard/registrations/projects?novo=1", forma: "pagina" },
  { label: "Novo centro de custo", icon: "network", rota: "/dashboard/registrations/cost-centers?novo=1", forma: "pagina" },
  { label: "Novo contrato", icon: "file-text", rota: "/dashboard/registrations/contracts?novo=1", forma: "modal", modal: "contrato" },
  { label: "Novo orçamento", icon: "target", rota: "/dashboard/registrations/budgets?novo=1", forma: "pagina" },
  { label: "Novo dashboard", icon: "layers", rota: "/dashboard/dashboards/custom?novo=1", forma: "pagina" },
  // — lacunas que a auditoria apontou: existiam no produto e não aqui —
  { label: "Novo usuário", icon: "users", rota: "/dashboard/administration/users?novo=1", forma: "pagina" },
];

export const ACOES_MOVIMENTACOES: Acao[] = [
  { label: "Nova conta a receber", icon: "arrow-left-right", rota: "/dashboard/financial/receivables/new", forma: "modal", modal: "receita" },
  { label: "Nova conta a pagar", icon: "arrow-up-right", rota: "/dashboard/financial/payables/new", forma: "modal", modal: "despesa" },
  { label: "Nova transferência", icon: "repeat", rota: "/dashboard/financial/accounts-and-transfers?tab=transfers&novo=1", forma: "modal", modal: "transferencia" },
  { label: "Nova venda", icon: "shopping-cart", rota: "/dashboard/sales-invoices/new", forma: "pagina" },
  { label: "Nova compra", icon: "inbox", rota: "/dashboard/purchases/new", forma: "pagina" },
  // — lacunas apontadas —
  { label: "Nova nota fiscal", icon: "receipt", rota: "/vendas?aba=notas&novo=1", forma: "pagina" },
  { label: "Nova assinatura / recorrência", icon: "repeat", rota: "/recebimentos?aba=recorrencias&novo=1", forma: "pagina" },
  { label: "Novo link de pagamento", icon: "link", rota: "/dashboard/sales-invoices/payment-links?novo=1", forma: "pagina" },
];

/**
 * ⚠️ **Criar EMPRESA não é criar registro.** "Nova empresa" aparecia na mesma
 * lista e com o mesmo peso visual de "Novo produto" — mas cria uma ORGANIZAÇÃO
 * inteira, com o seu próprio isolamento de dados, os seus membros e a sua
 * cobrança. A proximidade convida ao acidente, e desfazer não é apagar uma
 * linha. Fica separada, no rodapé do painel, com o aviso do que ela é.
 */
export const ACAO_NOVA_EMPRESA: Acao = {
  label: "Nova empresa", icon: "building", rota: "/empresas/nova", forma: "pagina",
};

/** No modo Pessoa Física a criação é curta — não há venda, contrato nem NF. */
export const ACOES_CADASTROS_PF: Acao[] = [
  { label: "Nova carteira / conta", icon: "credit-card", rota: "/dashboard/registrations/bank-accounts?novo=1", forma: "pagina" },
  { label: "Nova categoria", icon: "database", rota: "/dashboard/registrations/chart-of-accounts?novo=1", forma: "pagina" },
];
export const ACOES_MOVIMENTACOES_PF: Acao[] = [
  { label: "Nova receita", icon: "arrow-left-right", rota: "/dashboard/financial/receivables/new", forma: "modal", modal: "receita" },
  { label: "Nova despesa", icon: "arrow-up-right", rota: "/dashboard/financial/payables/new", forma: "modal", modal: "despesa" },
  { label: "Nova transferência", icon: "repeat", rota: "/dashboard/financial/accounts-and-transfers?tab=transfers&novo=1", forma: "modal", modal: "transferencia" },
];

