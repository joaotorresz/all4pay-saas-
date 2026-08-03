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
  { de: "/criar", para: "/", motivo: "criar virou painel, não rota" },
  { de: "/recebiveis", para: "/dashboard/financial/accounts-and-transfers?tab=receivables", motivo: "títulos consolidados na tela canônica (mapa, item 2)" },
  { de: "/pagaveis", para: "/dashboard/financial/accounts-and-transfers?tab=payables", motivo: "títulos consolidados na tela canônica (mapa, item 2)" },
  { de: "/import", para: "/upload", motivo: "importação virou aba da entrada de dados" },
  { de: "/inbox", para: "/upload", motivo: "caixa de entrada virou a esteira de ingestão" },
  { de: "/assistente", para: "/all4pay-ai", motivo: "assistente virou o copiloto" },

  // — hub CADASTROS —
  { de: "/produtos", para: "/dashboard/registrations/products", motivo: "cadastros consolidados em `registrations` (mapa, item 1)" },
  { de: "/servicos", para: "/dashboard/registrations/products", motivo: "cadastros consolidados em `registrations` (mapa, item 1)" },
  { de: "/contatos", para: "/dashboard/registrations/clients", motivo: "cadastros consolidados em `registrations` (mapa, item 1)" },
  { de: "/projetos", para: "/dashboard/registrations/projects", motivo: "cadastros consolidados em `registrations` (mapa, item 1)" },
  { de: "/centros-custo", para: "/dashboard/registrations/cost-centers", motivo: "cadastros consolidados em `registrations` (mapa, item 1)" },

  // — hub CONTABILIDADE —
  { de: "/plano-de-contas", para: "/contabilidade?aba=plano-de-contas", motivo: "consolidado no hub de contabilidade" },
  { de: "/razao", para: "/contabilidade?aba=razao", motivo: "consolidado no hub de contabilidade" },
  { de: "/fechamento", para: "/contabilidade?aba=fechamento", motivo: "consolidado no hub de contabilidade" },
  { de: "/receita", para: "/contabilidade?aba=receita", motivo: "consolidado no hub de contabilidade" },
  { de: "/relatorios", para: "/contabilidade?aba=relatorios", motivo: "consolidado no hub de contabilidade" },
  { de: "/dimensoes", para: "/contabilidade?aba=dimensoes", motivo: "consolidado no hub de contabilidade" },
  { de: "/cronogramas", para: "/contabilidade?aba=cronogramas", motivo: "consolidado no hub de contabilidade" },

  // — hub VENDAS —
  { de: "/painel-vendas", para: "/vendas?aba=painel", motivo: "consolidado no hub de vendas" },
  { de: "/nova-venda", para: "/vendas?aba=nova", motivo: "consolidado no hub de vendas" },
  { de: "/notas-fiscais", para: "/vendas?aba=notas", motivo: "consolidado no hub de vendas" },

  // — hub RECEBER / PAGAR —
  { de: "/recorrencias", para: "/dashboard/sales-invoices/subscriptions", motivo: "assinaturas têm UMA lista canônica (mapa de consolidação, item 7)" },
  { de: "/inadimplencia", para: "/dashboard/financial/overdue", motivo: "ganhou rota própria ao aposentar o hub (mapa, item 2)" },
  { de: "/boletos", para: "/dashboard/financial/boletos", motivo: "ganhou rota própria ao aposentar o hub (mapa, item 2)" },
  { de: "/reembolsos", para: "/dashboard/financial/reimbursements", motivo: "ganhou rota própria ao aposentar o hub (mapa, item 2)" },

  // — hub ENTRADA DE DADOS —
  { de: "/conciliacao", para: "/upload?aba=conciliar", motivo: "conciliação única na esteira de ingestão" },
  { de: "/conciliacao-bancaria", para: "/upload?aba=conciliar", motivo: "conciliação única na esteira de ingestão" },
  { de: "/contas", para: "/upload?aba=conectar", motivo: "contas viraram a aba de conectar bancos" },
  // ⚠️ O hub `/cadastros` foi APOSENTADO (mapa de consolidação, item 1): as
  // oito páginas de `registrations` são o destino, e Serviços virou filtro
  // explícito dentro de Produtos. Sem esse porte, apagar o hub apagaria o
  // cadastro de serviço inteiro.
  { de: "/cadastros", para: "/dashboard/registrations/clients", motivo: "cadastros consolidados em `registrations` (mapa, item 1)" },
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
  { de: "/copiloto", para: "/all4pay-ai", motivo: "IA tem UM ponto de entrada (mapa, item 6)" },
  { de: "/impostos", para: "/dashboard/sales-invoices/tax-provisioning", motivo: "imposto tem UM módulo canônico (mapa, item 5)" },
  { de: "/dre", para: "/dashboard/reports/dre", motivo: "DRE consolidado no relatório canônico (mapa, item 3)" },
  { de: "/recebimentos", para: "/dashboard/financial/accounts-and-transfers?tab=receivables", motivo: "títulos consolidados na tela canônica (mapa, item 2)" },
  { de: "/pagamentos", para: "/dashboard/financial/accounts-and-transfers?tab=payables", motivo: "títulos consolidados na tela canônica (mapa, item 2)" },

  // — hub COPILOTO (todos exigem plano Pro; ver `core/planos`) —
  { de: "/risco", para: "/all4pay-ai?aba=risco", motivo: "motor de risco virou aba do copiloto" },
  { de: "/decisao", para: "/all4pay-ai?aba=decisao", motivo: "motor de decisão virou aba do copiloto" },
  { de: "/autonomo", para: "/all4pay-ai?aba=autonomo", motivo: "operação autônoma virou aba do copiloto" },
  { de: "/inteligencia", para: "/all4pay-ai?aba=quant", motivo: "camada quantitativa virou aba do copiloto" },
  { de: "/consolidado", para: "/contabilidade?aba=consolidado", motivo: "consolidado virou aba de contabilidade" },
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
  { de: "/plataforma", para: "/governanca", motivo: "removida — hub esvaziado; governança assumiu" },
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
  { de: "/copiloto?aba=quant", para: "/all4pay-ai?aba=quant", motivo: "aba do copiloto aposentado (mapa, item 6)" },
  { de: "/copiloto?aba=decisao", para: "/all4pay-ai?aba=decisao", motivo: "aba do copiloto aposentado (mapa, item 6)" },
  { de: "/copiloto?aba=risco", para: "/all4pay-ai?aba=risco", motivo: "aba do copiloto aposentado (mapa, item 6)" },
  { de: "/copiloto?aba=autonomo", para: "/all4pay-ai?aba=autonomo", motivo: "aba do copiloto aposentado (mapa, item 6)" },
  { de: "/recebimentos?aba=inadimplencia", para: "/dashboard/financial/overdue", motivo: "aba do hub de receber/pagar aposentado (mapa, item 2)" },
  { de: "/recebimentos?aba=boletos", para: "/dashboard/financial/boletos", motivo: "aba do hub de receber/pagar aposentado (mapa, item 2)" },
  { de: "/pagamentos?aba=reembolsos", para: "/dashboard/financial/reimbursements", motivo: "aba do hub de receber/pagar aposentado (mapa, item 2)" },
  { de: "/recebimentos?aba=titulos", para: "/dashboard/financial/accounts-and-transfers?tab=receivables", motivo: "aba do hub de receber/pagar aposentado (mapa, item 2)" },
  { de: "/pagamentos?aba=titulos", para: "/dashboard/financial/accounts-and-transfers?tab=payables", motivo: "aba do hub de receber/pagar aposentado (mapa, item 2)" },

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
    para: "/dashboard/registrations/contracts",
    motivo: "aba do hub de cadastros aposentado (mapa, item 1)",
  },
  {
    de: "/cadastros?aba=orcamento",
    para: "/dashboard/registrations/budgets",
    motivo: "aba do hub de cadastros aposentado (mapa, item 1)",
  },

  {
    de: "/recebimentos?aba=recorrencias",
    para: "/dashboard/sales-invoices/subscriptions",
    motivo: "assinaturas passaram a ter UMA lista canônica (mapa de consolidação, item 7)",
  },
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
