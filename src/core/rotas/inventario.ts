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
  { rota: "/admin", nome: "Visão geral da plataforma", dono: "plataforma", status: "canonica", criterio: "ferramenta" },
  { rota: "/admin/clientes", nome: "Clientes e planos", dono: "plataforma", status: "canonica", criterio: "ferramenta" },
  { rota: "/admin/maquininhas", nome: "Maquininhas da plataforma", dono: "plataforma", status: "canonica", criterio: "ferramenta" },
  { rota: "/admin/cobranca", nome: "Cobrança da plataforma", dono: "plataforma", status: "canonica", criterio: "ferramenta" },
  { rota: "/admin/design-system", nome: "Design system da plataforma", dono: "plataforma", status: "canonica", criterio: "ferramenta" },
  { rota: "/admin/acessos", nome: "Acessos da plataforma", dono: "plataforma", status: "canonica", criterio: "ferramenta" },
  { rota: "/admin/suporte", nome: "Suporte aos clientes", dono: "plataforma", status: "canonica", criterio: "ferramenta" },
  { rota: "/quattro-ai", nome: "Quattro AI", dono: "inteligencia", status: "canonica", criterio: "diferencial" },
  { rota: "/central", nome: "Baixas a confirmar", dono: "movimentacoes", status: "canonica", criterio: "nucleo" },
  { rota: "/aprovacoes", nome: "Aprovações", dono: "governanca", status: "canonica", criterio: "travada" },
  { rota: "/governanca", nome: "Alçadas e papéis", dono: "governanca", status: "canonica", criterio: "travada" },
  { rota: "/comece", nome: "Primeiros passos", dono: "adocao", status: "canonica", criterio: "diferencial" },
  { rota: "/configuracoes", nome: "Meu perfil", dono: "plataforma", status: "canonica", criterio: "nucleo" },
  { rota: "/contabilidade", nome: "Razão contábil", dono: "contabilidade", status: "canonica", criterio: "nucleo" },
  { rota: "/contas-a-receber/painel-de-vendas", nome: "Painel de vendas", dono: "movimentacoes", status: "canonica", criterio: "nucleo" },
  { rota: "/contas-a-receber/maquininha", nome: "Maquininha Quattro", dono: "vendas", status: "canonica", criterio: "nucleo" },
  { rota: "/contas-a-receber/cobranca-automatica", nome: "Cobrança automática", dono: "movimentacoes", status: "canonica", criterio: "nucleo" },
  { rota: "/contas-a-pagar", nome: "Painel de contas a pagar", dono: "movimentacoes", status: "canonica", criterio: "nucleo" },
  { rota: "/contas-a-pagar/folha", nome: "Folha salarial", dono: "movimentacoes", status: "canonica", criterio: "nucleo" },
  { rota: "/contas-a-pagar/recorrentes", nome: "Contas recorrentes", dono: "movimentacoes", status: "canonica", criterio: "nucleo" },
  { rota: "/contas-a-pagar/titulos", nome: "Títulos a pagar", dono: "movimentacoes", status: "canonica", criterio: "nucleo" },
  { rota: "/contas-a-pagar/caixa-de-entrada", nome: "Caixa de entrada", dono: "compras", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/administration/audit-logs", nome: "Logs", dono: "plataforma", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/administration/company-data", nome: "Empresa", dono: "plataforma", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/administration/exported-reports", nome: "Arquivos gerados", dono: "plataforma", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/administration/integrations", nome: "Integrações e API", dono: "plataforma", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/administration/routes", nome: "Inventário de rotas", dono: "plataforma", status: "canonica", criterio: "ferramenta" },
  { rota: "/dashboard/administration/storage", nome: "Armazenamento e backup", dono: "plataforma", status: "canonica", criterio: "ferramenta" },
  { rota: "/dashboard/administration/security", nome: "Segurança da plataforma", dono: "plataforma", status: "canonica", criterio: "ferramenta" },
  { rota: "/dashboard/administration/subscription", nome: "Assinatura e plano", dono: "plataforma", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/administration/users", nome: "Usuários e papéis", dono: "plataforma", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/dashboards/custom", nome: "Meus painéis", dono: "paineis", status: "canonica", criterio: "travada" },
  { rota: "/dashboard/financial/overdue", nome: "Cobrança e inadimplência", dono: "movimentacoes", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/financial/reimbursements", nome: "Reembolsos", dono: "movimentacoes", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/financial/payables/new", nome: "Nova conta a pagar", dono: "movimentacoes", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/financial/receivables/new", nome: "Nova conta a receber", dono: "movimentacoes", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/financial/reconciliation", nome: "Conciliação bancária", dono: "movimentacoes", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/financial/statement", nome: "Extrato", dono: "movimentacoes", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/help", nome: "Ajuda", dono: "ajuda", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/purchases", nome: "Compras", dono: "compras", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/purchases/new", nome: "Nova compra", dono: "compras", status: "canonica", criterio: "nucleo" },
  // CAD (30/09/2026): o hub da ordem de dependência dos cadastros + "o que falta para lançar".
  { rota: "/dashboard/registrations", nome: "Estrutura e cadastros", dono: "cadastros", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/registrations/bank-accounts", nome: "Contas e cartões", dono: "cadastros", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/registrations/chart-of-accounts", nome: "Plano de contas", dono: "cadastros", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/registrations/clients", nome: "Clientes", dono: "cadastros", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/registrations/cost-centers", nome: "Centros de custo", dono: "cadastros", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/registrations/products", nome: "Produtos e serviços", dono: "cadastros", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/registrations/projects", nome: "Projetos", dono: "cadastros", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/registrations/suppliers", nome: "Fornecedores", dono: "cadastros", status: "canonica", criterio: "nucleo" },
  // Campfire-grade: o balanço comparativo e a explicação da variação do mês.
  { rota: "/dashboard/reports/balance-sheet", nome: "Balanço patrimonial", dono: "relatorios", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/reports/variance", nome: "Análise de variação", dono: "relatorios", status: "canonica", criterio: "diferencial" },
  { rota: "/dashboard/reports/dfc", nome: "DFC", dono: "relatorios", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/reports/dre", nome: "DRE", dono: "relatorios", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/reports/dre-multi", nome: "Multiempresas", dono: "relatorios", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/reports/monthly-closing", nome: "Fechamento mensal", dono: "relatorios", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/financial/boletos", nome: "Boletos e PIX", dono: "vendas", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/sales-invoices/payment-links", nome: "Links de pagamento", dono: "vendas", status: "canonica", criterio: "nucleo" },
  { rota: "/pos/taxas", nome: "Taxas do POS", dono: "vendas", status: "canonica", criterio: "diferencial" },
  { rota: "/pos/venda", nome: "Simulador de venda", dono: "vendas", status: "canonica", criterio: "diferencial" },
  { rota: "/dashboard/sales-invoices/invoices", nome: "Notas fiscais", dono: "vendas", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/sales-invoices/invoices/nfse", nome: "Emitir NFS-e", dono: "fiscal", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/sales-invoices/new", nome: "Nova venda", dono: "vendas", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/sales-invoices/subscriptions", nome: "Assinaturas e contratos", dono: "vendas", status: "canonica", criterio: "nucleo" },
  { rota: "/dashboard/sales-invoices/tax-provisioning", nome: "Impostos e obrigações", dono: "vendas", status: "canonica", criterio: "nucleo" },
  { rota: "/empresas/nova", nome: "Nova empresa", dono: "acesso", status: "canonica", criterio: "nucleo" },
  { rota: "/fluxo-caixa", nome: "Fluxo de caixa", dono: "movimentacoes", status: "canonica", criterio: "nucleo" },
  { rota: "/automacoes", nome: "Automações", dono: "inteligencia", status: "canonica", criterio: "diferencial" },
  { rota: "/simuladores", nome: "Simuladores", dono: "inteligencia", status: "canonica", criterio: "diferencial" },
  { rota: "/investidores", nome: "Relatório ao investidor", dono: "inteligencia", status: "canonica", criterio: "travada" },
  { rota: "/lixeira", nome: "Lixeira", dono: "movimentacoes", status: "canonica", criterio: "nucleo" },
  { rota: "/login", nome: "Entrar", dono: "acesso", status: "canonica", criterio: "nucleo" },
  { rota: "/orcamento", nome: "Orçamento", dono: "orcamento", status: "canonica", criterio: "diferencial" },
  { rota: "/planos", nome: "Planos", dono: "acesso", status: "canonica", criterio: "nucleo" },
  // Pública por natureza: quem lê política de privacidade ainda não tem conta.
  { rota: "/privacidade", nome: "Privacidade", dono: "acesso", status: "canonica", criterio: "nucleo" },
  // Pública pela mesma razão: metodologia lida só depois da compra não ajuda a
  // decidir a compra.
  { rota: "/metodologia", nome: "Metodologia", dono: "acesso", status: "canonica", criterio: "nucleo" },
  // Pública: é a página que o CLIENTE da empresa abre para pagar o título por
  // Pix ou boleto (`/pagar?t=<token>`). Ele não tem conta no sistema.
  { rota: "/pagar", nome: "Pagamento", dono: "vendas", status: "canonica", criterio: "diferencial" },
  // A porta de entrada: três campos, uma tela.
  { rota: "/criar-conta", nome: "Criar conta", dono: "acesso", status: "canonica", criterio: "nucleo" },
  // O fim do "esqueci a senha": só abre com a sessão de recuperação que a
  // rota de retorno do link (/api/auth/recuperar) acabou de criar.
  { rota: "/redefinir-senha", nome: "Nova senha", dono: "acesso", status: "canonica", criterio: "nucleo" },
  // O passo do código de quem cadastrou o aplicativo autenticador: a ÚNICA
  // rota que uma sessão de primeiro nível com segundo fator abre.
  { rota: "/segundo-fator", nome: "Código de verificação", dono: "acesso", status: "canonica", criterio: "nucleo" },
  // O segundo fator é da PESSOA: mora em "Meu perfil", não na administração
  // (que recusa justamente quem ainda não o cadastrou).
  { rota: "/configuracoes/seguranca", nome: "Segurança da conta", dono: "acesso", status: "canonica", criterio: "nucleo" },
  { rota: "/exportar", nome: "Enviar ao contador", dono: "contabilidade", status: "canonica", criterio: "nucleo" },
  { rota: "/upload", nome: "Entrada de dados", dono: "ingestao", status: "canonica", criterio: "nucleo" },
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
