/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O INVENTÁRIO OFICIAL DE ROTAS — a fonte da verdade para o menu, o teste e o
 * suporte.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **Toda rota viva tem de estar aqui.** A guarda da matriz varre
 * `src/app/**​/page.tsx`, deriva as rotas que o Next realmente publica e falha
 * quando encontra uma que ninguém declarou.
 *
 * Isso resolve o defeito estrutural que a auditoria descreveu: o produto tinha
 * endereços vivos que ninguém sabia que existiam. Rota não declarada é rota que
 * quebra sem ninguém ver, que duplica uma função sem ninguém notar, e que o
 * suporte não sabe explicar quando alguém a manda num print.
 *
 * Cada entrada declara:
 *  - **`nome`** — o nome ÚNICO da tela. É o que aparece no título da aba, e
 *    dois nomes iguais tornam duas abas abertas indistinguíveis.
 *  - **`dono`** — o módulo que responde por ela. Sem dono, uma rota órfã fica
 *    anos no ar porque remover parece arriscado e ninguém sabe a quem perguntar.
 *  - **`status`** — `canonica` (fica), `aposentando` (vai virar alias, com
 *    data), `interna` (não é destino de usuário: layout técnico, callback).
 *  - **`aposentadoriaEm`** — a data-limite. Sem data, "vamos aposentar" é uma
 *    intenção que nunca vence.
 *
 * Puro, sem imports. Versão inventario/1.0.0.
 */

export const INVENTARIO_VERSION = "inventario/1.0.0";

/** Os módulos que respondem por rotas. */
export type Modulo =
  | "home" | "acesso" | "adocao" | "ajuda" | "cadastros" | "compras"
  | "contabilidade" | "fiscal" | "governanca" | "ingestao" | "inteligencia"
  | "movimentacoes" | "orcamento" | "paineis" | "plataforma" | "relatorios"
  | "vendas" | "outro";

export type StatusRota =
  /** Fica. É o destino oficial da função. */
  | "canonica"
  /**
   * Vai virar alias. ⚠️ Só pode ser desligada quando a fusão correspondente em
   * `consolidacao.ts` tiver TODOS os itens portados — a guarda cobra isso.
   */
  | "aposentando"
  /** Não é destino de usuário (layout técnico, callback, rota de sistema). */
  | "interna";

export interface RotaInventario {
  rota: string;
  /** O nome ÚNICO da tela. */
  nome: string;
  dono: Modulo;
  status: StatusRota;
  /** Data-limite do desligamento. Obrigatória quando `aposentando`. */
  aposentadoriaEm?: string;
}

/**
 * ⚠️ As rotas marcadas `aposentando` são exatamente as que o mapa de
 * consolidação manda fundir. A data é a mesma para todas de propósito: são uma
 * decisão só, tomada de uma vez, e datas escalonadas viram um calendário que
 * ninguém acompanha.
 */
export const INVENTARIO: RotaInventario[] = [
  { rota: "/", nome: "Início", dono: "home", status: "canonica" },
  { rota: "/admin", nome: "Administração da plataforma", dono: "plataforma", status: "canonica" },
  { rota: "/all4pay-ai", nome: "All 4 Pay AI", dono: "inteligencia", status: "canonica" },
  { rota: "/aprovacoes", nome: "Solicitações & aprovações", dono: "governanca", status: "canonica" },
  { rota: "/comecar", nome: "Criar empresa", dono: "acesso", status: "canonica" },
  { rota: "/comece", nome: "Comece por aqui", dono: "adocao", status: "canonica" },
  { rota: "/configuracoes", nome: "Configurações da empresa", dono: "plataforma", status: "canonica" },
  { rota: "/contabilidade", nome: "Contabilidade", dono: "contabilidade", status: "canonica" },
  { rota: "/contratacoes", nome: "Plano de contratações", dono: "inteligencia", status: "canonica" },
  { rota: "/dashboard", nome: "Painéis", dono: "paineis", status: "canonica" },
  { rota: "/dashboard/accounting/dominio-export", nome: "Gerar TXT contábil", dono: "contabilidade", status: "canonica" },
  { rota: "/dashboard/accounting/nfe-export", nome: "Envio das NFs ao contador", dono: "contabilidade", status: "canonica" },
  { rota: "/dashboard/administration", nome: "Administração", dono: "plataforma", status: "canonica" },
  { rota: "/dashboard/administration/audit-logs", nome: "Logs", dono: "plataforma", status: "canonica" },
  { rota: "/dashboard/administration/company-data", nome: "Dados da empresa", dono: "plataforma", status: "canonica" },
  { rota: "/dashboard/administration/exported-reports", nome: "Relatórios exportados", dono: "plataforma", status: "canonica" },
  { rota: "/dashboard/administration/integrations", nome: "Integrações", dono: "plataforma", status: "canonica" },
  { rota: "/dashboard/administration/routes", nome: "Inventário de rotas", dono: "plataforma", status: "canonica" },
  { rota: "/dashboard/administration/storage", nome: "Armazenamento", dono: "plataforma", status: "canonica" },
  { rota: "/dashboard/administration/security", nome: "Segurança e isolamento", dono: "plataforma", status: "canonica" },
  { rota: "/dashboard/administration/subscription", nome: "Assinatura", dono: "plataforma", status: "canonica" },
  { rota: "/dashboard/administration/users", nome: "Gerenciar usuários", dono: "plataforma", status: "canonica" },
  { rota: "/dashboard/dashboards/custom", nome: "Meus dashboards", dono: "paineis", status: "canonica" },
  { rota: "/dashboard/financial/accounts-and-transfers", nome: "Títulos a receber", dono: "movimentacoes", status: "canonica" },
  { rota: "/dashboard/financial/boletos", nome: "Boletos", dono: "movimentacoes", status: "canonica" },
  { rota: "/dashboard/financial/overdue", nome: "Inadimplência", dono: "movimentacoes", status: "canonica" },
  { rota: "/dashboard/financial/reimbursements", nome: "Reembolsos", dono: "movimentacoes", status: "canonica" },
  { rota: "/dashboard/financial/credit-card-invoices", nome: "Fatura do cartão", dono: "movimentacoes", status: "canonica" },
  { rota: "/dashboard/financial/import", nome: "Importação em lote", dono: "movimentacoes", status: "canonica" },
  { rota: "/dashboard/financial/payables/new", nome: "Nova conta a pagar", dono: "movimentacoes", status: "canonica" },
  { rota: "/dashboard/financial/receivables/new", nome: "Nova conta a receber", dono: "movimentacoes", status: "canonica" },
  { rota: "/dashboard/financial/reconciliation", nome: "Conciliação bancária", dono: "movimentacoes", status: "canonica" },
  { rota: "/dashboard/financial/statement", nome: "Extrato", dono: "movimentacoes", status: "canonica" },
  { rota: "/dashboard/help", nome: "Central de ajuda", dono: "ajuda", status: "canonica" },
  { rota: "/dashboard/purchases", nome: "Compras", dono: "compras", status: "canonica" },
  { rota: "/dashboard/purchases/new", nome: "Nova compra", dono: "compras", status: "canonica" },
  { rota: "/dashboard/purchases/received-boletos", nome: "Boletos recebidos", dono: "compras", status: "canonica" },
  { rota: "/dashboard/purchases/received-invoices", nome: "NFs recebidas", dono: "compras", status: "canonica" },
  { rota: "/dashboard/registrations/bank-accounts", nome: "Contas bancárias", dono: "cadastros", status: "canonica" },
  { rota: "/dashboard/registrations/budgets", nome: "Orçamento", dono: "cadastros", status: "canonica" },
  { rota: "/dashboard/registrations/chart-of-accounts", nome: "Plano de contas", dono: "cadastros", status: "canonica" },
  { rota: "/dashboard/registrations/clients", nome: "Clientes", dono: "cadastros", status: "canonica" },
  { rota: "/dashboard/registrations/contracts", nome: "Contratos", dono: "cadastros", status: "canonica" },
  { rota: "/dashboard/registrations/cost-centers", nome: "Centros de custo", dono: "cadastros", status: "canonica" },
  { rota: "/dashboard/registrations/products", nome: "Produtos e serviços", dono: "cadastros", status: "canonica" },
  { rota: "/dashboard/registrations/projects", nome: "Projetos", dono: "cadastros", status: "canonica" },
  { rota: "/dashboard/registrations/suppliers", nome: "Fornecedores", dono: "cadastros", status: "canonica" },
  { rota: "/dashboard/reports", nome: "Relatórios", dono: "relatorios", status: "canonica" },
  { rota: "/dashboard/reports/cash-flow", nome: "Fluxo de caixa (relatório)", dono: "relatorios", status: "canonica" },
  { rota: "/dashboard/reports/dfc", nome: "DFC", dono: "relatorios", status: "canonica" },
  { rota: "/dashboard/reports/dfc-multi", nome: "DFC multiempresas", dono: "relatorios", status: "canonica" },
  { rota: "/dashboard/reports/dre", nome: "DRE", dono: "relatorios", status: "canonica" },
  { rota: "/dashboard/reports/dre-multi", nome: "DRE multiempresas", dono: "relatorios", status: "canonica" },
  { rota: "/dashboard/reports/monthly-closing", nome: "Fechamento mensal", dono: "relatorios", status: "canonica" },
  { rota: "/dashboard/sales-invoices", nome: "Vendas", dono: "vendas", status: "canonica" },
  { rota: "/dashboard/sales-invoices/invoices", nome: "Notas fiscais", dono: "vendas", status: "canonica" },
  { rota: "/dashboard/sales-invoices/new", nome: "Nova venda", dono: "vendas", status: "canonica" },
  { rota: "/dashboard/sales-invoices/payment-links", nome: "Links de pagamento", dono: "vendas", status: "canonica" },
  { rota: "/dashboard/sales-invoices/subscriptions", nome: "Assinaturas e contratos", dono: "vendas", status: "canonica" },
  { rota: "/dashboard/sales-invoices/tax-provisioning", nome: "Impostos sobre vendas", dono: "vendas", status: "canonica" },
  { rota: "/empresas/nova", nome: "Nova empresa", dono: "acesso", status: "canonica" },
  { rota: "/fluxo-caixa", nome: "Fluxo de caixa", dono: "movimentacoes", status: "canonica" },
  { rota: "/governanca", nome: "Governança e auditoria", dono: "governanca", status: "canonica" },
  { rota: "/investidores", nome: "Investor update", dono: "inteligencia", status: "canonica" },
  { rota: "/lixeira", nome: "Lixeira", dono: "movimentacoes", status: "canonica" },
  { rota: "/login", nome: "Entrar", dono: "acesso", status: "canonica" },
  { rota: "/orcamento", nome: "Planejado × Realizado", dono: "orcamento", status: "canonica" },
  { rota: "/planos", nome: "Planos", dono: "acesso", status: "canonica" },
  // Pública por natureza: quem lê política de privacidade ainda não tem conta.
  { rota: "/privacidade", nome: "Privacidade", dono: "acesso", status: "canonica" },
  { rota: "/pos/taxas", nome: "Taxas do POS", dono: "vendas", status: "canonica" },
  { rota: "/pos/venda", nome: "Venda no POS", dono: "vendas", status: "canonica" },
  { rota: "/upload", nome: "Upload de dados", dono: "ingestao", status: "canonica" },
  { rota: "/vendas", nome: "Vendas e NFs", dono: "vendas", status: "canonica" },
];

/* ========================================================================== */

export const rotaNoInventario = (r: string): RotaInventario | undefined =>
  INVENTARIO.find((i) => i.rota === (r.split("?")[0] || "/"));

export const CANONICAS: RotaInventario[] = INVENTARIO.filter((i) => i.status === "canonica");
export const APOSENTANDO: RotaInventario[] = INVENTARIO.filter((i) => i.status === "aposentando");

/**
 * Nomes repetidos — o que torna duas abas indistinguíveis.
 * Devolve os nomes que aparecem em mais de uma rota.
 */
export function nomesDuplicados(): { nome: string; rotas: string[] }[] {
  const por = new Map<string, string[]>();
  for (const i of INVENTARIO) {
    if (i.status === "interna") continue;
    por.set(i.nome, [...(por.get(i.nome) ?? []), i.rota]);
  }
  return Array.from(por, ([nome, rotas]) => ({ nome, rotas })).filter((n) => n.rotas.length > 1);
}
