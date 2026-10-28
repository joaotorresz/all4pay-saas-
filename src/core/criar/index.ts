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

/**
 * ⚠️ **UM FORMULÁRIO POR ITEM, UMA PORTA (decisão do dono, 27/10/2026).**
 *
 * "Nova venda" no Painel de vendas abria a tela completa; o "Novo" do topo
 * abria um pop-up curto, de outro formulário, que gravava outra coisa. O mesmo
 * valia para conta a pagar/receber, cliente, fornecedor, contrato e
 * transferência: DOIS formulários para o mesmo item, escolhidos pela porta.
 *
 * Agora cada item tem UM `TipoCriacao`, e toda porta (Criar, "Novo" do topo,
 * botão da tela, menu, ⌘K, IA, link `?novo=1`) chama `abrirCriacao(tipo)`.
 * Quem desenha é `components/app/CriacaoGlobal`, sempre em POP-UP (o dono
 * escolheu "tudo em pop-up", inclusive venda e compra) e sempre com o
 * formulário COMPLETO da tela de cadastro. A regra modal × página de baixo
 * virou histórico para estes itens.
 */
export type TipoCriacao =
  | "venda" | "compra" | "receber" | "pagar" | "transferencia"
  | "cliente" | "fornecedor" | "produto" | "servico"
  | "conta-bancaria" | "categoria" | "projeto" | "centro"
  | "contrato-cliente" | "contrato-fornecedor"
  | "orcamento-venda" | "transportadora" | "marca" | "unidade";

/** O título de cada pop-up — o mesmo, venha de onde vier. */
export const TITULO_CRIACAO: Record<TipoCriacao, string> = {
  venda: "Nova venda",
  compra: "Nova compra",
  receber: "Nova conta a receber",
  pagar: "Nova conta a pagar",
  transferencia: "Nova transferência",
  cliente: "Novo cliente",
  fornecedor: "Novo fornecedor",
  produto: "Novo produto",
  servico: "Novo serviço",
  "conta-bancaria": "Nova conta bancária",
  categoria: "Nova categoria",
  projeto: "Novo projeto",
  centro: "Novo centro de custo",
  "contrato-cliente": "Novo contrato de cliente",
  "contrato-fornecedor": "Novo contrato de fornecedor",
  "orcamento-venda": "Novo orçamento de venda",
  transportadora: "Nova transportadora",
  marca: "Nova marca",
  unidade: "Nova unidade de medida",
};

/**
 * Os endereços de criação que existem desde antes — guardados em favorito,
 * citados nos guias, nos atalhos da IA e no menu. Um clique em qualquer um
 * deles (sem Ctrl/⌘) abre o pop-up em vez de trocar de tela; abrir em nova aba
 * continua indo à página, que monta o MESMO formulário.
 *
 * A transferência tem página própria (`/dashboard/financial/transfers`); o
 * endereço antigo `bank-accounts?aba=transferencias` segue casando antes de
 * "nova conta bancária", para o link guardado abrir a transferência.
 */
const ROTAS: { caminho: string; query?: Record<string, string>; tipo: TipoCriacao }[] = [
  { caminho: "/dashboard/sales-invoices/new", tipo: "venda" },
  { caminho: "/dashboard/purchases/new", tipo: "compra" },
  { caminho: "/dashboard/financial/receivables/new", tipo: "receber" },
  { caminho: "/dashboard/financial/payables/new", tipo: "pagar" },
  { caminho: "/dashboard/financial/transfers", query: { novo: "*" }, tipo: "transferencia" },
  { caminho: "/dashboard/registrations/bank-accounts", query: { aba: "transferencias", novo: "*" }, tipo: "transferencia" },
  { caminho: "/dashboard/registrations/clients", query: { novo: "*" }, tipo: "cliente" },
  { caminho: "/dashboard/registrations/suppliers", query: { novo: "*" }, tipo: "fornecedor" },
  { caminho: "/dashboard/registrations/products", query: { novo: "*" }, tipo: "produto" },
  { caminho: "/dashboard/registrations/bank-accounts", query: { novo: "*" }, tipo: "conta-bancaria" },
  { caminho: "/dashboard/registrations/chart-of-accounts", query: { novo: "*" }, tipo: "categoria" },
  { caminho: "/dashboard/registrations/projects", query: { novo: "*" }, tipo: "projeto" },
  { caminho: "/dashboard/registrations/cost-centers", query: { novo: "*" }, tipo: "centro" },
  { caminho: "/dashboard/sales-invoices/subscriptions", query: { aba: "contratos-cliente", novo: "*" }, tipo: "contrato-cliente" },
];

/**
 * O tipo de criação de um endereço, ou `null` quando ele não cria nada.
 * ⚠️ Edição (`?id=`) NÃO é criação: a venda aberta para editar segue na página.
 */
export function tipoDaRota(href: string): TipoCriacao | null {
  let url: URL;
  try { url = new URL(href, "https://x.local"); } catch { return null; }
  if (url.searchParams.get("id")) return null;
  const caminho = url.pathname.replace(/\/+$/, "") || "/";
  for (const r of ROTAS) {
    if (r.caminho !== caminho) continue;
    const q = r.query ?? {};
    const casa = Object.entries(q).every(([k, v]) => {
      const atual = url.searchParams.get(k);
      return v === "*" ? atual !== null : atual === v;
    });
    if (casa) return r.tipo;
  }
  return null;
}

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
  /** O item que a ação cria — abre o pop-up único (`abrirCriacao`). */
  tipo?: TipoCriacao;
}

/**
 * As rotas `?novo=<x>` abrem a tela do assunto JÁ com o formulário aberto. É o
 * que dá endereço compartilhável a um modal — "manda o link de nova venda" é um
 * pedido corriqueiro, e antes não tinha resposta.
 */
export const ACOES_CADASTROS: Acao[] = [
  { label: "Novo cliente", icon: "users", rota: "/dashboard/registrations/clients?novo=1", forma: "modal", tipo: "cliente" },
  { label: "Novo fornecedor", icon: "building", rota: "/dashboard/registrations/suppliers?novo=1", forma: "modal", tipo: "fornecedor" },
  { label: "Novo produto", icon: "package", rota: "/dashboard/registrations/products?novo=1", forma: "modal", tipo: "produto" },
  { label: "Nova conta bancária", icon: "credit-card", rota: "/dashboard/registrations/bank-accounts?novo=1", forma: "modal", tipo: "conta-bancaria" },
  { label: "Nova categoria", icon: "database", rota: "/dashboard/registrations/chart-of-accounts?novo=1", forma: "modal", tipo: "categoria" },
  { label: "Novo projeto", icon: "target", rota: "/dashboard/registrations/projects?novo=1", forma: "modal", tipo: "projeto" },
  { label: "Novo centro de custo", icon: "network", rota: "/dashboard/registrations/cost-centers?novo=1", forma: "modal", tipo: "centro" },
  { label: "Novo contrato", icon: "file-text", rota: "/dashboard/sales-invoices/subscriptions?aba=contratos-cliente&novo=1", forma: "modal", tipo: "contrato-cliente" },
  { label: "Novo orçamento", icon: "target", rota: "/orcamento?aba=orcamentos&novo=1", forma: "pagina" },
  { label: "Novo painel", icon: "layers", rota: "/dashboard/dashboards/custom?novo=1", forma: "pagina" },
  // — lacunas que a auditoria apontou: existiam no produto e não aqui —
  { label: "Novo usuário", icon: "users", rota: "/dashboard/administration/users?novo=1", forma: "pagina" },
];

export const ACOES_MOVIMENTACOES: Acao[] = [
  { label: "Nova conta a receber", icon: "arrow-left-right", rota: "/dashboard/financial/receivables/new", forma: "modal", tipo: "receber" },
  { label: "Nova conta a pagar", icon: "arrow-up-right", rota: "/dashboard/financial/payables/new", forma: "modal", tipo: "pagar" },
  { label: "Nova transferência", icon: "repeat", rota: "/dashboard/financial/transfers?novo=1", forma: "modal", tipo: "transferencia" },
  { label: "Nova venda", icon: "shopping-cart", rota: "/dashboard/sales-invoices/new", forma: "modal", tipo: "venda" },
  { label: "Nova compra", icon: "inbox", rota: "/dashboard/purchases/new", forma: "modal", tipo: "compra" },
  // — lacunas apontadas —
  { label: "Nova nota fiscal", icon: "receipt", rota: "/dashboard/sales-invoices/invoices/nfse", forma: "pagina" },
  // ⚠️ Abria o formulário de CONTRATO, que em demonstração não grava nada e
  // responde "Contrato salvo" — a assinatura nunca aparecia. A assinatura se
  // cria na aba "Contratos e MRR" da própria tela, que tem itens do catálogo,
  // ciclo e a ativação que lança as faturas previstas.
  { label: "Nova assinatura / recorrência", icon: "repeat", rota: "/dashboard/sales-invoices/subscriptions", forma: "pagina" },
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
  { label: "Nova carteira / conta", icon: "credit-card", rota: "/dashboard/registrations/bank-accounts?novo=1", forma: "modal", tipo: "conta-bancaria" },
  { label: "Nova categoria", icon: "database", rota: "/dashboard/registrations/chart-of-accounts?novo=1", forma: "modal", tipo: "categoria" },
];
export const ACOES_MOVIMENTACOES_PF: Acao[] = [
  { label: "Nova receita", icon: "arrow-left-right", rota: "/dashboard/financial/receivables/new", forma: "modal", tipo: "receber" },
  { label: "Nova despesa", icon: "arrow-up-right", rota: "/dashboard/financial/payables/new", forma: "modal", tipo: "pagar" },
  { label: "Nova transferência", icon: "repeat", rota: "/dashboard/financial/transfers?novo=1", forma: "modal", tipo: "transferencia" },
];

