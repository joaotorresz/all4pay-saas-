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

/**
 * A PILHA em que a rota caiu quando o produto foi classificado.
 *
 * ⚠️ Sem isto o inventário responde "esta rota existe e alguém responde por
 * ela" e não responde a pergunta que decide o corte: **por que ela continua
 * existindo?** Foi assim que o produto chegou a oito grupos de vitrine técnica
 * — nenhuma rota estava errada isoladamente, e nenhuma tinha de se justificar.
 *
 *  - **`nucleo`** — o que um financeiro paga para ter, mais o que o produto
 *    precisa para entregar isso (entrar, cobrar, ler a política). Corte aqui
 *    é perda de função.
 *  - **`diferencial`** — sustenta preço sem ser o núcleo: a superfície de IA,
 *    planejado × realizado, a jornada de adesão. Fica com escopo apertado.
 *  - **`travada`** — boa e cara de manter; existe atrás do plano.
 *  - **`ferramenta`** — instrumento de quem opera a plataforma, não do
 *    cliente. Vive atrás do portão de administrador.
 *
 * A quinta pilha da classificação — **corte** — não vira valor aqui de
 * propósito: rota cortada não tem linha. O que sobra dela é o desvio em
 * `aliases.ts`, e é lá que ela tem de ser procurada.
 */
export type CriterioRota = "nucleo" | "diferencial" | "travada" | "ferramenta";

export interface RotaInventario {
  rota: string;
  /** O nome ÚNICO da tela. */
  nome: string;
  dono: Modulo;
  status: StatusRota;
  /**
   * Por que ela continua existindo. ⚠️ OBRIGATÓRIO — é o campo que faz uma
   * rota nova ter de se justificar antes de ser publicada. Um campo opcional
   * aqui seria preenchido nas antigas e esquecido justamente nas novas, que
   * são as que ninguém discutiu.
   */
  criterio: CriterioRota;
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
  { rota: "/", nome: "Visão geral", dono: "home", status: "canonica", criterio: "nucleo" },
  { rota: "/admin", nome: "Administração da plataforma", dono: "plataforma", status: "canonica", criterio: "ferramenta" },
  { rota: "/all4pay-ai", nome: "All 4 Pay AI", dono: "inteligencia", status: "canonica", criterio: "diferencial" },
  { rota: "/aprovacoes", nome: "Aprovações", dono: "governanca", status: "canonica", criterio: "travada" },
  { rota: "/central", nome: "Central financeira", dono: "movimentacoes", status: "canonica", criterio: "nucleo" },
  { rota: "/comecar", nome: "Criar empresa", dono: "acesso", status: "canonica", criterio: "nucleo" },
  { rota: "/comece", nome: "Primeiros passos", dono: "adocao", status: "canonica", criterio: "diferencial" },
  { rota: "/configuracoes", nome: "Configurações da empresa", dono: "plataforma", status: "canonica", criterio: "nucleo" },
  { rota: "/contabilidade", nome: "Contabilidade", dono: "contabilidade", status: "canonica", criterio: "nucleo" },
  { rota: "/contas-a-receber", nome: "Painel de contas a receber", dono: "movimentacoes", status: "canonica", criterio: "nucleo" },
  { rota: "/contas-a-receber/titulos", nome: "Títulos a receber", dono: "movimentacoes", status: "canonica", criterio: "nucleo" },
  { rota: "/contas-a-pagar", nome: "Painel de contas a pagar", dono: "movimentacoes", status: "canonica", criterio: "nucleo" },
  { rota: "/contas-a-pagar/folha", nome: "Folha salarial", dono: "movimentacoes", status: "canonica", criterio: "nucleo" },
  { rota: "/contas-a-pagar/recorrentes", nome: "Contas recorrentes", dono: "movimentacoes", status: "canonica", criterio: "nucleo" },
  { rota: "/contas-a-pagar/titulos", nome: "Títulos a pagar", dono: "movimentacoes", status: "canonica", criterio: "nucleo" },
  { rota: "/contratacoes", nome: "Plano de contratações", dono: "inteligencia", status: "canonica", criterio: "travada" },
  { rota: "/dashboard", nome: "Painéis", dono: "paineis", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/accounting/dominio-export", nome: "Gerar TXT contábil", dono: "contabilidade", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/accounting/nfe-export", nome: "Envio das NFs ao contador", dono: "contabilidade", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/administration", nome: "Administração", dono: "plataforma", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/administration/audit-logs", nome: "Logs", dono: "plataforma", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/administration/company-data", nome: "Empresa", dono: "plataforma", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/administration/exported-reports", nome: "Relatórios exportados", dono: "plataforma", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/administration/integrations", nome: "Integrações e API", dono: "plataforma", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/administration/routes", nome: "Inventário de rotas", dono: "plataforma", status: "canonica", criterio: "ferramenta" },
  { rota: "/dashboard/administration/storage", nome: "Armazenamento e backup", dono: "plataforma", status: "canonica", criterio: "ferramenta" },
  { rota: "/dashboard/administration/security", nome: "Segurança", dono: "plataforma", status: "canonica", criterio: "ferramenta" },
  { rota: "/dashboard/administration/subscription", nome: "Assinatura e plano", dono: "plataforma", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/administration/users", nome: "Usuários e papéis", dono: "plataforma", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/dashboards/custom", nome: "Meus dashboards", dono: "paineis", status: "canonica", criterio: "travada" },
  { rota: "/dashboard/financial/accounts-and-transfers", nome: "Transferências entre contas", dono: "movimentacoes", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/financial/boletos", nome: "Boletos e PIX", dono: "movimentacoes", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/financial/overdue", nome: "Inadimplência e cobrança", dono: "movimentacoes", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/financial/reimbursements", nome: "Reembolsos", dono: "movimentacoes", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/financial/credit-card-invoices", nome: "Fatura do cartão", dono: "movimentacoes", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/financial/payables/new", nome: "Nova conta a pagar", dono: "movimentacoes", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/financial/receivables/new", nome: "Nova conta a receber", dono: "movimentacoes", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/financial/reconciliation", nome: "Conciliação bancária", dono: "movimentacoes", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/financial/statement", nome: "Extrato", dono: "movimentacoes", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/help", nome: "Ajuda", dono: "ajuda", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/purchases", nome: "Compras", dono: "compras", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/purchases/new", nome: "Nova compra", dono: "compras", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/purchases/received-boletos", nome: "Boletos recebidos (DDA)", dono: "compras", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/purchases/received-invoices", nome: "NFs recebidas", dono: "compras", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/registrations/bank-accounts", nome: "Contas bancárias", dono: "cadastros", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/registrations/budgets", nome: "Orçamentos", dono: "cadastros", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/registrations/chart-of-accounts", nome: "Plano de contas", dono: "cadastros", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/registrations/clients", nome: "Clientes", dono: "cadastros", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/registrations/contracts", nome: "Contratos", dono: "cadastros", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/registrations/cost-centers", nome: "Centros de custo", dono: "cadastros", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/registrations/products", nome: "Produtos e serviços", dono: "cadastros", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/registrations/projects", nome: "Projetos", dono: "cadastros", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/registrations/suppliers", nome: "Fornecedores", dono: "cadastros", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/reports", nome: "Relatórios", dono: "relatorios", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/reports/cash-flow", nome: "Fluxo de caixa (relatório)", dono: "relatorios", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/reports/dfc", nome: "DFC", dono: "relatorios", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/reports/dfc-multi", nome: "DFC multiempresas", dono: "relatorios", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/reports/dre", nome: "DRE", dono: "relatorios", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/reports/dre-multi", nome: "DRE multiempresas", dono: "relatorios", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/reports/monthly-closing", nome: "Fechamento mensal", dono: "relatorios", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/sales-invoices", nome: "Painel de vendas", dono: "vendas", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/sales-invoices/invoices", nome: "Notas fiscais emitidas", dono: "vendas", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/sales-invoices/new", nome: "Nova venda", dono: "vendas", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/sales-invoices/payment-links", nome: "Links de pagamento", dono: "vendas", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/sales-invoices/subscriptions", nome: "Assinaturas e recorrência", dono: "vendas", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/sales-invoices/tax-provisioning", nome: "Impostos e obrigações", dono: "vendas", status: "canonica", criterio: "nucleo" },
  { rota: "/empresas/nova", nome: "Nova empresa", dono: "acesso", status: "canonica", criterio: "nucleo" },
  { rota: "/fluxo-caixa", nome: "Fluxo de caixa", dono: "movimentacoes", status: "canonica", criterio: "nucleo" },
  { rota: "/governanca", nome: "Governança e aprovações", dono: "governanca", status: "canonica", criterio: "travada" },
  { rota: "/investidores", nome: "Investor update", dono: "inteligencia", status: "canonica", criterio: "travada" },
  { rota: "/lixeira", nome: "Lixeira", dono: "movimentacoes", status: "canonica", criterio: "nucleo" },
  { rota: "/login", nome: "Entrar", dono: "acesso", status: "canonica", criterio: "nucleo" },
  { rota: "/orcamento", nome: "Planejado × Realizado", dono: "orcamento", status: "canonica", criterio: "diferencial" },
  { rota: "/planos", nome: "Planos", dono: "acesso", status: "canonica", criterio: "nucleo" },
  // Pública por natureza: quem lê política de privacidade ainda não tem conta.
  { rota: "/privacidade", nome: "Privacidade", dono: "acesso", status: "canonica", criterio: "nucleo" },
  // Pública pela mesma razão: metodologia lida só depois da compra não ajuda a
  // decidir a compra.
  { rota: "/metodologia", nome: "Metodologia", dono: "acesso", status: "canonica", criterio: "nucleo" },
  // A porta de entrada: três campos, uma tela.
  { rota: "/criar-conta", nome: "Criar conta", dono: "acesso", status: "canonica", criterio: "nucleo" },
  { rota: "/pos/taxas", nome: "Taxas do POS", dono: "vendas", status: "canonica", criterio: "diferencial" },
  { rota: "/pos/venda", nome: "Venda no POS", dono: "vendas", status: "canonica", criterio: "diferencial" },
  { rota: "/upload", nome: "Entrada de dados", dono: "ingestao", status: "canonica", criterio: "nucleo" },
  { rota: "/vendas", nome: "Vendas e NFs", dono: "vendas", status: "canonica", criterio: "nucleo" },
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
