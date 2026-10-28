/**
 * O REGISTRO DE ALIASES — os endereços antigos que ainda respondem.
 *
 * ⚠️ Havia **34** desvios vivos na raiz do domínio, nenhum documentado, nenhum
 * no menu, nenhum testado, e todos feitos no CLIENTE: a página montava vazia,
 * um `useEffect` disparava e só então o navegador ia para o destino. Isso
 * custa três coisas:
 *
 *  1. **Não é um redirecionamento de verdade.** Sem 308, quem compartilha o
 *     link, o histórico do navegador e qualquer pré-visualização enxergam uma
 *     página em branco, não o destino.
 *  2. **Piscada branca** a cada acesso, porque o React precisa montar antes.
 *  3. **Ninguém sabia que existiam** — e endereço vivo que ninguém conhece é
 *     endereço que quebra sem ninguém perceber.
 *
 * Este arquivo é a fonte única. O `next.config.ts` o transforma em
 * redirecionamentos HTTP de verdade, e a matriz de consistência cobra que todo
 * destino exista, que nenhum alias apareça no menu e que não haja ciclo.
 *
 * ⚠️ Sem imports: o `next.config.ts` precisa carregá-lo em tempo de build, onde
 * o alias `@/` não existe.
 */

export interface Alias {
  /** O endereço antigo (o que ainda chega). */
  de: string;
  /** Para onde ele vai hoje. */
  para: string;
  /** Por que ele existe — quem lê daqui a um ano precisa saber se pode remover. */
  motivo: string;
}

/**
 * ⚠️ Todos **permanentes** (HTTP 308). São links que já foram compartilhados e
 * estão em favoritos: um 302 diria ao navegador "volte a perguntar", e o
 * endereço antigo nunca deixaria de ser tratado como o canônico.
 */
export const ALIASES: Alias[] = [
  // — telas que viraram a MESMA tela —
  { de: "/visao-geral", para: "/", motivo: "a visão geral virou a Home" },
  { de: "/contas-a-receber", para: "/contas-a-receber/painel-de-vendas", motivo: "o painel de contas a receber saiu do menu (26/10/2026): o Painel de vendas tem os mesmos cards e títulos" },
  { de: "/dashboard/sales-invoices/pedidos", para: "/contas-a-receber/painel-de-vendas", motivo: "Pedidos de venda saiu a pedido do dono (27/10/2026): a lista, o emitir NF, o editar e o excluir moram no Painel de vendas" },
  { de: "/dashboard/sales-invoices", para: "/contas-a-receber/painel-de-vendas", motivo: "a tela Vendas foi desativada a pedido do dono (27/10/2026): o Painel de vendas é a tela de vendas; as abas dela voltaram a endereço próprio" },
  { de: "/contas-a-pagar", para: "/contas-a-pagar/painel-de-despesas", motivo: "Central de despesas (27/10/2026): o painel de contas a pagar virou o Painel de despesas, no molde do Painel de vendas" },
  { de: "/contas-a-pagar/titulos", para: "/contas-a-pagar/painel-de-despesas", motivo: "Central de despesas (27/10/2026): a tabela de títulos a pagar mora no Painel de despesas, a mesma TitulosView" },
  { de: "/dashboard/purchases", para: "/contas-a-pagar/painel-de-despesas", motivo: "Central de despesas (27/10/2026): a lista de compras mora no Painel de despesas, como a de vendas no Painel de vendas" },
  { de: "/contas-a-receber/titulos", para: "/contas-a-receber/painel-de-vendas", motivo: "títulos a receber saiu do menu (26/10/2026): a tabela mora no Painel de vendas, a mesma TitulosView" },
  { de: "/criar", para: "/", motivo: "criar virou painel, não rota" },
  { de: "/recebiveis", para: "/contas-a-receber/painel-de-vendas", motivo: "títulos consolidados na tela canônica (mapa, item 2)" },
  { de: "/pagaveis", para: "/contas-a-pagar/painel-de-despesas", motivo: "títulos consolidados na tela canônica (mapa, item 2)" },
  { de: "/comecar", para: "/criar-conta", motivo: "o cadastro de sete passos foi desativado a pedido do dono (27/10/2026): a abertura de conta é a conversa de /criar-conta, para empresa e pessoa física" },
  { de: "/import", para: "/upload", motivo: "importação virou aba da entrada de dados" },
  { de: "/dashboard/financial/import", para: "/upload", motivo: "A4P-040: a importação de planilha virou mais um formato do /upload (Bloco D); um pipeline, uma porta" },
  { de: "/inbox", para: "/upload", motivo: "caixa de entrada virou a esteira de ingestão" },
  { de: "/assistente", para: "/quattro-ai", motivo: "assistente virou o copiloto" },
  // ⚠️ Enxugamento do MVP (30/09/2026). Cada uma era a SEGUNDA tela para uma
  // pergunta que outra já respondia: `/dashboard` era uma segunda Home com
  // atalhos (um deles apontava para um alias), e `/governanca` repetia a
  // alçada e a trilha das aprovações com um item de menu próprio.
  { de: "/dashboard", para: "/", motivo: "segunda tela de início aposentada no enxugamento do menu (30/09/2026)" },
  { de: "/all4pay-ai", para: "/quattro-ai", motivo: "a marca virou Quattro (30/09/2026); o endereço antigo está em favoritos" },

  // — hub CADASTROS —
  { de: "/produtos", para: "/dashboard/registrations/products", motivo: "os cadastros passaram a ficar juntos na área de Cadastros" },
  { de: "/servicos", para: "/dashboard/registrations/products", motivo: "os cadastros passaram a ficar juntos na área de Cadastros" },
  { de: "/contatos", para: "/dashboard/registrations/clients", motivo: "os cadastros passaram a ficar juntos na área de Cadastros" },
  { de: "/projetos", para: "/dashboard/registrations/projects", motivo: "os cadastros passaram a ficar juntos na área de Cadastros" },
  { de: "/centros-custo", para: "/dashboard/registrations/cost-centers", motivo: "os cadastros passaram a ficar juntos na área de Cadastros" },

  // — hub CONTABILIDADE —
  { de: "/plano-de-contas", para: "/dashboard/registrations/chart-of-accounts", motivo: "o plano de contas tem UMA tela canônica, em Cadastros" },
  { de: "/razao", para: "/contabilidade", motivo: "consolidado no hub de contabilidade" },
  { de: "/fechamento", para: "/dashboard/reports/monthly-closing", motivo: "o fechamento mensal tem UMA tela canônica" },
  { de: "/relatorios", para: "/dashboard/reports/dre", motivo: "consolidado no hub de contabilidade" },

  // — hub VENDAS —
  // ⚠️ O hub `/vendas` foi APOSENTADO (mapa de consolidação, item 9): ele
  // repetia a lista, o painel, a nova venda e as notas de "Vendas e NFs" com
  // componentes e dados diferentes. Os três endereços que desembocavam nele
  // apontam direto para a tela que ficou — alias não aponta para alias.
  { de: "/painel-vendas", para: "/contas-a-receber/painel-de-vendas", motivo: "vendas têm UMA tela canônica (mapa, item 9)" },
  { de: "/nova-venda", para: "/dashboard/sales-invoices/new", motivo: "vendas têm UMA tela canônica (mapa, item 9)" },
  { de: "/notas-fiscais", para: "/dashboard/sales-invoices/invoices/nfse", motivo: "o emissor de NFS-e virou aba das notas fiscais (mapa, item 9)" },
  { de: "/vendas", para: "/contas-a-receber/painel-de-vendas", motivo: "hub duplicado de vendas aposentado (mapa, item 9)" },

  // — hub RECEBER / PAGAR —
  { de: "/recorrencias", para: "/dashboard/sales-invoices/subscriptions", motivo: "assinaturas têm UMA lista canônica (mapa de consolidação, item 7)" },
  { de: "/inadimplencia", para: "/dashboard/financial/overdue", motivo: "ganhou rota própria ao aposentar o hub (mapa, item 2)" },
  { de: "/boletos", para: "/dashboard/financial/boletos", motivo: "ganhou rota própria ao aposentar o hub (mapa, item 2)" },
  { de: "/reembolsos", para: "/dashboard/financial/reimbursements", motivo: "ganhou rota própria ao aposentar o hub (mapa, item 2)" },

  // — hub ENTRADA DE DADOS —
  { de: "/conciliacao", para: "/dashboard/financial/reconciliation", motivo: "conciliação única (mapa, item 8)" },
  { de: "/conciliacao-bancaria", para: "/dashboard/financial/reconciliation", motivo: "conciliação única (mapa, item 8)" },
  { de: "/contas", para: "/upload?aba=conectar", motivo: "contas viraram a aba de conectar bancos" },
  // ⚠️ O hub `/cadastros` foi APOSENTADO (mapa de consolidação, item 1): as
  // oito páginas de `registrations` são o destino, e Serviços virou filtro
  // explícito dentro de Produtos. Sem esse porte, apagar o hub apagaria o
  // cadastro de serviço inteiro.
  // CAD (30/09/2026): o destino deixou de ser Clientes e passou a ser o hub
  // "Estrutura e cadastros" — a canônica que o mapa já declarava.
  { de: "/cadastros", para: "/dashboard/registrations", motivo: "os cadastros ganharam um hub com a ordem entre eles: Estrutura e cadastros" },
  // ⚠️ Os hubs de Receber/Pagar foram APOSENTADOS (mapa, item 2) só depois de a
  // canônica ganhar o carrossel de sazonalidade, a baixa na linha, e de as três
  // abas órfãs (inadimplência, boletos, reembolsos) receberem rota própria.
  // ⚠️ `/dre` foi APOSENTADO (mapa, item 3) depois de a canônica ganhar os
  // cartões executivos e o período padrão de 12 meses. O drill-down já existia.
  // ⚠️ `/impostos` foi APOSENTADO (mapa, item 5) depois de a canônica ganhar a
  // projeção da carga E o regime lido da configuração da empresa. A tela
  // aposentada cravava Lucro Presumido serviços num array: uma empresa do
  // Simples via uma projeção sem relação com o que paga.
  // ⚠️ `/copiloto` foi APOSENTADO (mapa, item 6) depois de as quatro abas
  // virarem painéis do assistente E o histórico passar a ser por usuário e por
  // empresa no servidor. A conversa é a porta; os motores são relatórios que
  // ela abre.
  { de: "/copiloto", para: "/quattro-ai", motivo: "IA tem UM ponto de entrada (mapa, item 6)" },
  { de: "/impostos", para: "/dashboard/sales-invoices/tax-provisioning", motivo: "imposto tem UM módulo canônico (mapa, item 5)" },
  { de: "/dre", para: "/dashboard/reports/dre", motivo: "DRE consolidado no relatório canônico (mapa, item 3)" },
  { de: "/recebimentos", para: "/contas-a-receber/painel-de-vendas", motivo: "títulos consolidados na tela canônica (mapa, item 2)" },
  { de: "/pagamentos", para: "/contas-a-pagar/painel-de-despesas", motivo: "títulos consolidados na tela canônica (mapa, item 2)" },

  // — hub COPILOTO: `/risco`, `/decisao`, `/autonomo` e `/inteligencia`
  // voltaram a ser PÁGINAS em 27/10/2026 (fim das abas internas), Pro pelo
  // servidor (`ROTAS_PRO`). Os aliases deles saíram. —

  // — PAINÉIS CURADOS aposentados (corte de superfície, 05/08/2026) —
  //
  // ⚠️ Cada painel respondia uma pergunta que OUTRA tela já responde, e a
  // duplicata custava o de sempre: dois números com o mesmo rótulo, um deles
  // sempre mais desatualizado. O motor (`core/paineis`) FICA — ele é um dos
  // caminhos que a matriz de reconciliação confronta para o MRR, e apagá-lo
  // tiraria a conferência junto com a tela. O que sai é a superfície.
  //
  // O destino de cada um é a tela que já responde a MESMA pergunta, não a
  // Home: mandar tudo para a Home é o desvio que faz a pessoa concluir que a
  // função sumiu.
  { de: "/dashboard/dashboards", para: "/dashboard/dashboards/custom", motivo: "hub esvaziado; sobrou o construtor" },
  { de: "/dashboard/dashboards/financial", para: "/fluxo-caixa", motivo: "saldo, geração de caixa e entradas/saídas já são o fluxo de caixa" },
  { de: "/dashboard/dashboards/sales", para: "/contas-a-receber/painel-de-vendas", motivo: "a lista de vendas já traz os painéis de status" },
  { de: "/dashboard/dashboards/subscriptions", para: "/dashboard/sales-invoices/subscriptions", motivo: "assinaturas têm UMA lista canônica (mapa, item 7)" },
  { de: "/dashboard/dashboards/payables", para: "/contas-a-pagar/painel-de-despesas", motivo: "títulos a pagar têm UMA tela canônica (mapa, item 2)" },
  { de: "/dashboard/dashboards/receivables", para: "/contas-a-receber/painel-de-vendas", motivo: "títulos a receber têm UMA tela canônica (mapa, item 2)" },
  { de: "/dashboard/financial/calendar", para: "/fluxo-caixa", motivo: "o calendário diário já é um bloco do fluxo de caixa" },
  // — REMODELAÇÃO DO MENU (19/10/2026): telas irmãs viraram ABAS de uma tela só —
  { de: "/dashboard/registrations/contracts", para: "/dashboard/sales-invoices/subscriptions?aba=contratos-cliente", motivo: "remodelação do menu (19/10/2026): virou aba de Assinaturas e contratos (cliente) e de Contas recorrentes (fornecedor)" },
  { de: "/dashboard/purchases/received-invoices", para: "/contas-a-pagar/caixa-de-entrada?caixa=nfs", motivo: "remodelação do menu (19/10/2026): virou aba da caixa de entrada dos títulos a pagar" },
  { de: "/dashboard/purchases/received-boletos", para: "/contas-a-pagar/caixa-de-entrada?caixa=boletos", motivo: "remodelação do menu (19/10/2026): virou aba da caixa de entrada dos títulos a pagar" },
  { de: "/dashboard/financial/accounts-and-transfers", para: "/dashboard/financial/transfers", motivo: "virou aba de Contas e cartões (19/10) e, sem abas internas (27/10/2026), a página Transferências" },
  { de: "/dashboard/reports/cash-flow", para: "/dashboard/reports/dfc?aba=mensal", motivo: "remodelação do menu (19/10/2026): virou aba do DFC" },
  { de: "/dashboard/registrations/budgets", para: "/orcamento", motivo: "virou aba do Orçamento (19/10) e, sem abas internas (27/10/2026), a página Orçamentos" },
  { de: "/dashboard/reports", para: "/dashboard/reports/dre", motivo: "hub de relatórios aposentado: cada relatório é um item do menu" },
  { de: "/dashboard/administration", para: "/dashboard/administration/company-data", motivo: "hub de administração aposentado: cada seção é um item de Configurações" },
];

/**
 * ROTAS REMOVIDAS que ainda aparecem em rastro antigo (marcadores de tour
 * concluído no navegador, favoritos, links em e-mails já enviados).
 *
 * ⚠️ Eram vitrine técnica sem uso operacional e foram removidas — mas ninguém
 * limpou as referências, e o mecanismo de onboarding continuava carregando o
 * rastro delas. Um endereço que responde 404 num sistema que a pessoa acabou
 * de comprar lê-se como produto quebrado, não como página aposentada.
 *
 * Vão para a Home com um destino honesto em vez de 404.
 */
export const ROTAS_REMOVIDAS: Alias[] = [
  { de: "/arquitetura", para: "/", motivo: "removida — vitrine técnica sem uso operacional" },
  { de: "/infraestrutura", para: "/", motivo: "removida — vitrine técnica sem uso operacional" },
  { de: "/orquestracao", para: "/", motivo: "removida — vitrine técnica sem uso operacional" },
  { de: "/dados", para: "/upload", motivo: "removida — a entrada de dados assumiu o papel" },
  { de: "/plataforma", para: "/governanca", motivo: "removida — hub esvaziado; a governança mora nas Aprovações" },
];

/**
 * ABAS aposentadas dentro de hubs que continuam vivos.
 *
 * ⚠️ Uma aba tem endereço (`/recebimentos?aba=recorrencias`) e as pessoas o
 * guardam nos favoritos como qualquer outro. Aposentar a aba sem desviar o
 * endereço produz um hub que abre na primeira aba em silêncio — a pessoa acha
 * que clicou errado, não que a tela mudou de lugar.
 *
 * O `de` inclui a query; o casamento é pelo par caminho + parâmetro.
 */
export const ALIASES_DE_ABA: Alias[] = [
  // — FIM DAS ABAS INTERNAS, etapa 4 (27/10/2026) —
  { de: "/orcamento?aba=orcamentos", para: "/orcamento", motivo: "aba da tela Orçamento, desativada em 27/10/2026: virou a página Orçamentos" },
  { de: "/orcamento?aba=variancia", para: "/orcamento/realizado", motivo: "aba da tela Orçamento, desativada em 27/10/2026: virou a página Planejado × Realizado" },
  { de: "/simuladores?aba=posso-comprar", para: "/simuladores", motivo: "aba da tela Simuladores, desativada em 27/10/2026: o endereço ficou com o Posso comprar?" },
  { de: "/simuladores?aba=contratacoes", para: "/contratacoes", motivo: "aba da tela Simuladores, desativada em 27/10/2026: voltou ao endereço próprio" },
  { de: "/quattro-ai?aba=risco", para: "/risco", motivo: "aba da Quattro AI, desativada em 27/10/2026: voltou ao endereço próprio" },
  { de: "/quattro-ai?aba=decisao", para: "/decisao", motivo: "aba da Quattro AI, desativada em 27/10/2026: voltou ao endereço próprio" },
  { de: "/quattro-ai?aba=quant", para: "/inteligencia", motivo: "aba da Quattro AI, desativada em 27/10/2026: voltou ao endereço próprio" },
  { de: "/quattro-ai?aba=autonomo", para: "/autonomo", motivo: "aba da Quattro AI, desativada em 27/10/2026: voltou ao endereço próprio" },
  { de: "/dashboard/sales-invoices?aba=pedidos", para: "/contas-a-receber/painel-de-vendas", motivo: "aba da tela Vendas, desativada em 27/10/2026: a lista de vendas mora no Painel de vendas" },
  { de: "/dashboard/sales-invoices?aba=boletos", para: "/dashboard/financial/boletos", motivo: "aba da tela Vendas, desativada em 27/10/2026: voltou ao endereço próprio" },
  { de: "/dashboard/sales-invoices?aba=links", para: "/dashboard/sales-invoices/payment-links", motivo: "aba da tela Vendas, desativada em 27/10/2026: voltou ao endereço próprio" },
  { de: "/dashboard/sales-invoices?aba=maquininha", para: "/pos/venda", motivo: "aba da tela Vendas, desativada em 27/10/2026: voltou ao endereço próprio" },
  { de: "/dashboard/sales-invoices?aba=taxas", para: "/pos/taxas", motivo: "aba da tela Vendas, desativada em 27/10/2026: voltou ao endereço próprio" },
  { de: "/all4pay-ai?aba=quant", para: "/inteligencia", motivo: "a marca virou Quattro; a aba do endereço antigo continua valendo" },
  { de: "/all4pay-ai?aba=decisao", para: "/decisao", motivo: "a marca virou Quattro; a aba do endereço antigo continua valendo" },
  { de: "/all4pay-ai?aba=risco", para: "/risco", motivo: "a marca virou Quattro; a aba do endereço antigo continua valendo" },
  { de: "/all4pay-ai?aba=autonomo", para: "/autonomo", motivo: "a marca virou Quattro; a aba do endereço antigo continua valendo" },
  { de: "/copiloto?aba=quant", para: "/inteligencia", motivo: "aba do copiloto aposentado (mapa, item 6)" },
  { de: "/copiloto?aba=decisao", para: "/decisao", motivo: "aba do copiloto aposentado (mapa, item 6)" },
  { de: "/copiloto?aba=risco", para: "/risco", motivo: "aba do copiloto aposentado (mapa, item 6)" },
  { de: "/copiloto?aba=autonomo", para: "/autonomo", motivo: "aba do copiloto aposentado (mapa, item 6)" },
  { de: "/recebimentos?aba=inadimplencia", para: "/dashboard/financial/overdue", motivo: "aba do hub de receber/pagar aposentado (mapa, item 2)" },
  { de: "/recebimentos?aba=boletos", para: "/dashboard/financial/boletos", motivo: "aba do hub de receber/pagar aposentado (mapa, item 2)" },
  { de: "/pagamentos?aba=reembolsos", para: "/dashboard/financial/reimbursements", motivo: "aba do hub de receber/pagar aposentado (mapa, item 2)" },
  /**
   * ⚠️ As duas apontavam para as ABAS do hub de títulos, e agora apontam para
   * as telas próprias. Deixá-las no hub faria um endereço antigo desembocar
   * numa aba que virou alias — um desvio levando a outro desvio, que é como um
   * favorito acaba piscando duas telas antes de parar.
   */
  { de: "/recebimentos?aba=titulos", para: "/contas-a-receber/painel-de-vendas", motivo: "aba do hub de receber/pagar aposentado (mapa, item 2)" },
  { de: "/pagamentos?aba=titulos", para: "/contas-a-pagar/painel-de-despesas", motivo: "aba do hub de receber/pagar aposentado (mapa, item 2)" },

  /**
   * ⚠️ **AS DUAS ABAS DE TÍTULOS DO HUB VIRARAM DESVIO.**
   *
   * O hub `accounts-and-transfers` nasceu com três abas — receber, pagar e
   * transferências. Quando "Títulos a pagar" ganhou tela própria, a aba ficou:
   * duas portas para a mesma lista, uma delas fora do menu e por isso invisível
   * na revisão. Ao criar o lado de receber isso viraria TRÊS padrões para a
   * mesma leitura.
   *
   * O hub fica sendo o que sobrou dele e só isso: transferências. Os endereços
   * das abas continuam respondendo, porque uma aba TEM endereço e as pessoas o
   * guardam nos favoritos — aposentá-la sem desviar faria o hub abrir na
   * primeira aba em silêncio, e quem clicou concluiria que errou o link.
   */
  { de: "/dashboard/financial/accounts-and-transfers?tab=receivables", para: "/contas-a-receber/painel-de-vendas", motivo: "aba de títulos a receber virou tela própria" },
  { de: "/dashboard/financial/accounts-and-transfers?tab=payables", para: "/contas-a-pagar/painel-de-despesas", motivo: "aba de títulos a pagar virou tela própria" },

  {
    de: "/cadastros?aba=clientes",
    para: "/dashboard/registrations/clients",
    motivo: "aba do hub de cadastros aposentado (mapa, item 1)",
  },
  {
    de: "/cadastros?aba=fornecedores",
    para: "/dashboard/registrations/suppliers",
    motivo: "aba do hub de cadastros aposentado (mapa, item 1)",
  },
  {
    de: "/cadastros?aba=produtos",
    para: "/dashboard/registrations/products",
    motivo: "aba do hub de cadastros aposentado (mapa, item 1)",
  },
  {
    de: "/cadastros?aba=servicos",
    para: "/dashboard/registrations/products",
    motivo: "aba do hub de cadastros aposentado (mapa, item 1)",
  },
  {
    de: "/cadastros?aba=contas",
    para: "/dashboard/registrations/bank-accounts",
    motivo: "aba do hub de cadastros aposentado (mapa, item 1)",
  },
  {
    de: "/cadastros?aba=plano",
    para: "/dashboard/registrations/chart-of-accounts",
    motivo: "aba do hub de cadastros aposentado (mapa, item 1)",
  },
  {
    de: "/cadastros?aba=centros-custo",
    para: "/dashboard/registrations/cost-centers",
    motivo: "aba do hub de cadastros aposentado (mapa, item 1)",
  },
  {
    de: "/cadastros?aba=projetos",
    para: "/dashboard/registrations/projects",
    motivo: "aba do hub de cadastros aposentado (mapa, item 1)",
  },
  {
    de: "/cadastros?aba=contratos",
    para: "/dashboard/sales-invoices/subscriptions?aba=contratos-cliente",
    motivo: "aba do hub de cadastros aposentado (mapa, item 1)",
  },
  {
    de: "/cadastros?aba=orcamento",
    para: "/orcamento",
    motivo: "aba do hub de cadastros aposentado (mapa, item 1)",
  },

  {
    de: "/recebimentos?aba=recorrencias",
    para: "/dashboard/sales-invoices/subscriptions",
    motivo: "assinaturas passaram a ter UMA lista canônica (mapa de consolidação, item 7)",
  },

  // — abas do hub de dashboards, aposentado com os painéis curados —
  //
  // ⚠️ A command palette apontava para `?aba=…`, e endereço de palette entra
  // no histórico do navegador como qualquer outro. Sem estes pares o hub
  // desviaria para o construtor levando quem pediu o painel de vendas.
  { de: "/dashboard/dashboards?aba=financeiro", para: "/fluxo-caixa", motivo: "aba do hub de dashboards aposentado" },
  { de: "/dashboard/dashboards?aba=vendas", para: "/contas-a-receber/painel-de-vendas", motivo: "aba do hub de dashboards aposentado" },
  { de: "/dashboard/dashboards?aba=assinaturas", para: "/dashboard/sales-invoices/subscriptions", motivo: "aba do hub de dashboards aposentado" },
  { de: "/dashboard/dashboards?aba=pagar", para: "/contas-a-pagar/painel-de-despesas", motivo: "aba do hub de dashboards aposentado" },
  { de: "/dashboard/dashboards?aba=receber", para: "/contas-a-receber/painel-de-vendas", motivo: "aba do hub de dashboards aposentado" },
  { de: "/dashboard/dashboards?aba=calendario", para: "/fluxo-caixa", motivo: "aba do hub de dashboards aposentado" },
  { de: "/dashboard/dashboards?aba=meus", para: "/dashboard/dashboards/custom", motivo: "aba do hub de dashboards aposentado" },

  // ⚠️ A aba "Conciliar" da entrada de dados virou a aba "Open Finance" da
  // conciliação bancária (mapa, item 8): eram duas conciliações com o mesmo
  // nome e resultados que uma não enxergava da outra.
  { de: "/upload?aba=conciliar", para: "/dashboard/financial/reconciliation?aba=open-finance", motivo: "conciliação única (mapa, item 8)" },

  // ⚠️ O fechamento mensal tinha TRÊS endereços (a rota própria e uma aba em
  // cada hub) e o plano de contas, dois. As abas saíram dos hubs; os
  // endereços delas continuam valendo, desviados para a tela canônica.
  { de: "/contabilidade?aba=fechamento", para: "/dashboard/reports/monthly-closing", motivo: "aba duplicada da tela canônica de fechamento mensal" },
  { de: "/dashboard/reports?aba=fechamento", para: "/dashboard/reports/monthly-closing", motivo: "aba duplicada da tela canônica de fechamento mensal" },
  { de: "/contabilidade?aba=plano-de-contas", para: "/dashboard/registrations/chart-of-accounts", motivo: "aba duplicada da tela canônica do plano de contas" },

  // — abas do hub `/vendas`, aposentado (mapa, item 9) —
  { de: "/vendas?aba=lista", para: "/contas-a-receber/painel-de-vendas", motivo: "aba do hub de vendas aposentado (mapa, item 9)" },
  { de: "/vendas?aba=painel", para: "/contas-a-receber/painel-de-vendas", motivo: "aba do hub de vendas aposentado (mapa, item 9)" },
  { de: "/vendas?aba=nova", para: "/dashboard/sales-invoices/new", motivo: "aba do hub de vendas aposentado (mapa, item 9)" },
  { de: "/vendas?aba=notas", para: "/dashboard/sales-invoices/invoices/nfse", motivo: "aba do hub de vendas aposentado (mapa, item 9)" },
  { de: "/vendas?aba=pos", para: "/pos/venda", motivo: "a maquininha voltou para a rota própria (mapa, item 9)" },
  { de: "/vendas?aba=pos-taxas", para: "/pos/taxas", motivo: "as taxas da maquininha voltaram para a rota própria (mapa, item 9)" },
  // — REMODELAÇÃO DO MENU (19/10/2026) —
  { de: "/aprovacoes?painel=governanca", para: "/governanca", motivo: "aba aposentada na remodelação do menu (19/10/2026)" },
  { de: "/orcamento?aba=simulador", para: "/simuladores", motivo: "aba aposentada na remodelação do menu (19/10/2026)" },
  { de: "/configuracoes?aba=automacoes", para: "/automacoes?aba=alertas", motivo: "aba aposentada na remodelação do menu (19/10/2026)" },
  { de: "/dashboard/reports?aba=dfc", para: "/dashboard/reports/dfc", motivo: "aba aposentada na remodelação do menu (19/10/2026)" },
  { de: "/dashboard/reports?aba=balanco", para: "/dashboard/reports/balance-sheet", motivo: "aba aposentada na remodelação do menu (19/10/2026)" },
  { de: "/dashboard/reports?aba=variacao", para: "/dashboard/reports/variance", motivo: "aba aposentada na remodelação do menu (19/10/2026)" },
  { de: "/dashboard/reports?aba=dre-multi", para: "/dashboard/reports/dre-multi", motivo: "aba aposentada na remodelação do menu (19/10/2026)" },
  { de: "/dashboard/reports?aba=dfc-multi", para: "/dashboard/reports/dfc-multi", motivo: "aba aposentada na remodelação do menu (19/10/2026)" },
  { de: "/dashboard/administration?aba=assinatura", para: "/dashboard/administration/subscription", motivo: "aba aposentada na remodelação do menu (19/10/2026)" },
  { de: "/dashboard/administration?aba=empresa", para: "/dashboard/administration/company-data", motivo: "aba aposentada na remodelação do menu (19/10/2026)" },
  { de: "/dashboard/administration?aba=usuarios", para: "/dashboard/administration/users", motivo: "aba aposentada na remodelação do menu (19/10/2026)" },
  { de: "/dashboard/administration?aba=logs", para: "/dashboard/administration/audit-logs", motivo: "aba aposentada na remodelação do menu (19/10/2026)" },
  { de: "/dashboard/administration?aba=integracoes", para: "/dashboard/administration/integrations", motivo: "aba aposentada na remodelação do menu (19/10/2026)" },
  { de: "/dashboard/administration?aba=exportados", para: "/dashboard/administration/exported-reports", motivo: "aba aposentada na remodelação do menu (19/10/2026)" },
  { de: "/contabilidade?aba=relatorios", para: "/dashboard/reports/dre", motivo: "aba aposentada na remodelação do menu (19/10/2026)" },
  { de: "/contabilidade?aba=envio", para: "/dashboard/accounting/nfe-export", motivo: "aba aposentada na remodelação do menu (19/10/2026)" },
  { de: "/contabilidade?aba=txt-dominio", para: "/dashboard/accounting/dominio-export", motivo: "aba aposentada na remodelação do menu (19/10/2026)" },
  { de: "/contabilidade?aba=consolidado", para: "/consolidado", motivo: "aba aposentada na remodelação do menu (19/10/2026)" },
  // O fim das abas internas (27/10/2026, decisão do dono): cada aba virou
  // endereço próprio. ⚠️ A ordem importa: o par mais específico (com
  // `caixa=`) vem antes do geral, senão o geral o capturaria.
  { de: "/central?aba=solicitacoes", para: "/aprovacoes", motivo: "abas internas aposentadas (27/10/2026): as solicitações voltaram a endereço próprio" },
  { de: "/central?aba=alcadas", para: "/governanca", motivo: "abas internas aposentadas (27/10/2026): alçadas e papéis moram em Configurações" },
  { de: "/contabilidade?aba=razao", para: "/contabilidade", motivo: "abas internas aposentadas (27/10/2026): o Razão contábil é só os lançamentos" },
  { de: "/contabilidade?aba=receita", para: "/receita", motivo: "abas internas aposentadas (27/10/2026): reconhecimento de receita tem página própria" },
  { de: "/contabilidade?aba=cronogramas", para: "/cronogramas", motivo: "abas internas aposentadas (27/10/2026): cronogramas têm página própria" },
  { de: "/contabilidade?aba=dimensoes", para: "/dimensoes", motivo: "abas internas aposentadas (27/10/2026): dimensões têm página própria" },
  { de: "/exportar?aba=razao-dre", para: "/exportar", motivo: "abas internas aposentadas (27/10/2026): razão e DRE ficaram em /exportar" },
  { de: "/exportar?aba=dominio", para: "/dashboard/accounting/dominio-export", motivo: "abas internas aposentadas (27/10/2026): o TXT Domínio tem página própria" },
  { de: "/exportar?aba=nfs", para: "/dashboard/accounting/nfe-export", motivo: "abas internas aposentadas (27/10/2026): o envio das NFs tem página própria" },
  { de: "/dashboard/reports/dre-multi?aba=dre", para: "/dashboard/reports/dre-multi", motivo: "abas internas aposentadas (27/10/2026): o DRE do grupo ficou em Multiempresas" },
  { de: "/dashboard/reports/dre-multi?aba=dfc", para: "/dashboard/reports/dfc-multi", motivo: "abas internas aposentadas (27/10/2026): o DFC do grupo tem página própria" },
  { de: "/dashboard/reports/dre-multi?aba=consolidado", para: "/consolidado", motivo: "abas internas aposentadas (27/10/2026): a posição consolidada tem página própria (Pro)" },
  { de: "/upload?aba=regras", para: "/upload/regras", motivo: "abas internas aposentadas (27/10/2026): regras de categoria têm página própria" },
  { de: "/upload?aba=limpeza", para: "/upload/duplicatas", motivo: "abas internas aposentadas (27/10/2026): duplicatas têm página própria" },
  { de: "/dashboard/registrations/bank-accounts?aba=faturas", para: "/dashboard/financial/credit-card-invoices", motivo: "abas internas aposentadas (27/10/2026): faturas do cartão têm página própria" },
  { de: "/dashboard/registrations/bank-accounts?aba=transferencias", para: "/dashboard/financial/transfers", motivo: "abas internas aposentadas (27/10/2026): transferências têm página própria" },
  { de: "/contas-a-pagar/titulos?aba=caixa-de-entrada&caixa=nfs", para: "/contas-a-pagar/caixa-de-entrada?caixa=nfs", motivo: "abas internas aposentadas (27/10/2026): a caixa de entrada tem tela própria" },
  { de: "/contas-a-pagar/titulos?aba=caixa-de-entrada&caixa=boletos", para: "/contas-a-pagar/caixa-de-entrada?caixa=boletos", motivo: "abas internas aposentadas (27/10/2026): a caixa de entrada tem tela própria" },
  { de: "/contas-a-pagar/titulos?aba=caixa-de-entrada", para: "/contas-a-pagar/caixa-de-entrada", motivo: "abas internas aposentadas (27/10/2026): a caixa de entrada tem tela própria" },
  { de: "/dashboard/sales-invoices/invoices?aba=nfse", para: "/dashboard/sales-invoices/invoices/nfse", motivo: "abas internas aposentadas (27/10/2026): emitir NFS-e virou botão com endereço próprio" },
];

/** Tudo que o middleware transforma em 308. */
export const TODOS_OS_DESVIOS: Alias[] = [...ALIASES, ...ROTAS_REMOVIDAS, ...ALIASES_DE_ABA];

/**
 * O destino de um endereço antigo, ou `null` se ele não é um desvio.
 *
 * Casa PRIMEIRO por caminho+query (a aba aposentada é mais específica que o
 * hub) e só depois por caminho — a ordem inversa faria o hub capturar a aba.
 */
export function destinoDe(rota: string, busca?: string): string | null {
  const [caminho, queryDaRota] = rota.split("?");
  const p = (caminho || "/").replace(/\/+$/, "") || "/";
  const q = (busca ?? queryDaRota ?? "").replace(/^\?/, "");

  if (q) {
    const params = new URLSearchParams(q);
    for (const a of ALIASES_DE_ABA) {
      const [ac, aq] = a.de.split("?");
      if (ac !== p) continue;
      const alvo = new URLSearchParams(aq ?? "");
      let bate = true;
      alvo.forEach((v, k) => { if (params.get(k) !== v) bate = false; });
      if (bate) return a.para;
    }
  }
  return [...ALIASES, ...ROTAS_REMOVIDAS].find((a) => a.de === p)?.para ?? null;
}
