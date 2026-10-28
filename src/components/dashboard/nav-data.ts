"use client";

/**
 * Dados de navegação do app — a ÚNICA fonte de verdade dos grupos/itens.
 *
 * Vivia dentro do `Sidebar.tsx`. Com a saída do menu vertical (a navegação foi
 * para a barra horizontal do topo), os dados passaram a viver aqui para que o
 * `TopNav` (desktop), o drawer mobile e qualquer outra superfície leiam a MESMA
 * estrutura. Nenhuma rota foi removida ou renomeada nesta extração.
 */
import * as React from "react";
import { useModo } from "@/components/app/useModo";
import { useTipoConta } from "@/components/app/useTipoConta";
import { isPlatformAdmin } from "@/lib/admin";

export type Item = {
  label: string;
  /**
   * O SUBTÍTULO da linha do menu — o que ESTA tela responde, em uma frase.
   *
   * ⚠️ Mora aqui, na fonte única, e não na Sidebar: o mesmo item aparece na
   * lateral, na paleta e nas guardas, e um texto escrito na tela divergiria no
   * dia em que a lista mudasse de lugar. É a mesma razão pela qual `label` e
   * `icon` já viviam aqui.
   *
   * Ele não repete o rótulo com outras palavras — diz a PERGUNTA que a tela
   * responde ("O que os clientes ainda devem"), porque um subtítulo que só
   * parafraseia o título ocupa uma linha e não decide nada.
   */
  desc?: string;
  href?: string;
  icon: string;
  /**
   * Evento que o item dispara no lugar de navegar. Com `href` junto, o clique
   * simples dispara o evento e o clique com modificador (nova aba) segue o
   * endereço — é assim que "Quattro AI" abre o chat por cima da tela atual.
   */
  event?: string;
  soon?: boolean;
  /**
   * O item exige plano Pro.
   *
   * ⚠️ A trava era do GRUPO, e isso obrigava o menu a ser organizado por
   * PREÇO: existiam os grupos "Inteligência" e "Governança" porque era ali que
   * cabia o que é pago, não porque um financeiro procure por esses nomes. O
   * resultado foi um menu com taxonomia dupla — parte por assunto, parte por
   * cobrança — e um item pago que mudasse de assunto teria de mudar de grupo.
   * A trava é do ITEM: o menu volta a ser por assunto e a cobrança fica onde
   * ela pertence, na linha.
   */
  pro?: boolean;
};

/**
 * Um grupo do menu.
 *
 * `href` presente ⇒ o grupo É um destino (folha, sem chevron) — é assim que
 * Início aparece no mesmo nível dos grupos que abrem.
 */
export type Section = {
  id: string;
  label: string;
  icon?: string;
  href?: string;
  /** Mesmo papel do `Item.desc` — só os grupos-FOLHA (com `href`) o usam. */
  desc?: string;
  items: Item[];
  /**
   * A ação primária do grupo — o botão no topo da coluna lateral.
   *
   * ⚠️ Mora AQUI, na fonte única, e não dentro da Sidebar. Se a barra
   * conhecesse a rota de "Nova conta a pagar" ela passaria a saber de negócio,
   * e o segundo grupo que ganhasse um botão exigiria um `if` por id — que é
   * como um componente de navegação vira uma lista de casos particulares.
   *
   * Ausente ⇒ o grupo não tem ação primária e a coluna começa direto no título.
   */
  acao?: { label: string; href: string; icon: string };
};

/**
 * As telas que NÃO estão no menu porque têm uma porta melhor.
 *
 * ⚠️ Isto não é uma lista de exceções para calar a guarda — é a declaração de
 * ONDE cada uma mora. Uma tela sem porta nenhuma é uma tela que só existe para
 * quem já sabe o endereço; uma tela com porta global e mais uma linha de menu é
 * a duplicata que produziu seis entradas para a mesma IA. A guarda de
 * navegação aceita estas e só estas, e cobra a porta declarada.
 */
export const ACOES_GLOBAIS: { rota: string; onde: string }[] = [
  { rota: "/quattro-ai", onde: "chat em tela cheia, aberto pelo menu, pelo ⌘K e pela caixa da Home" },
  { rota: "/dashboard/help", onde: "menu ⋮ da barra superior" },
  { rota: "/comece", onde: "aba Primeiros passos na Central de ajuda + menu ⋮ da barra superior" },
  { rota: "/configuracoes", onde: "menu ⋮ da barra superior (Meu perfil)" },
  { rota: "/configuracoes/seguranca", onde: "menu ⋮ da barra superior (Segurança da conta) + aviso da tela de Segurança da plataforma" },
];

/* ----------------------------- EMPRESA (PJ) -----------------------------
 * SEIS grupos, cada um com um substantivo que um financeiro reconhece sem
 * explicação: Início · Movimentações · Entradas · Relatórios · Cadastros ·
 * Contabilidade e impostos.
 *
 * ⚠️ Eram QUINZE. Quinze grupos de primeiro nível é mais do que alguém mantém
 * na cabeça, e a consequência não é estética: **quando ninguém acha, alguém
 * constrói de novo**. As telas duplicadas deste repositório — duas de "a
 * receber", três de assinaturas, seis portas para a mesma IA — nasceram todas
 * do mesmo lugar. O menu não era uma lista comprida; era a causa.
 *
 * Três regras que a divisão anterior quebrava:
 *
 *  1. **Um grupo é um ASSUNTO, não um preço.** "Inteligência" e "Governança"
 *     existiam porque era ali que cabia o que é pago. Agora a trava é por item
 *     (`Item.pro`) e os pagos moram no assunto deles — aprovações junto do
 *     dinheiro, investor update junto dos relatórios.
 *  2. **Um grupo é um assunto, não um FORMATO.** "Dashboards", "DRE & DFC" e
 *     "Orçamento" eram três grupos para a mesma pergunta: como foi o
 *     resultado. Viraram Relatórios.
 *  3. **Uma tela com porta global não vira linha de menu** (`ACOES_GLOBAIS`).
 *
 * Configurações continua fora desta lista: ela é a engrenagem da barra
 * superior e o rodapé da própria barra lateral. ⚠️ O rodapé NÃO foi removido —
 * ele carrega quatro entradas que o hub da engrenagem não tem (Nova empresa,
 * Configurações da empresa, Lixeira e, para quem responde pela plataforma, as
 * ferramentas de engenharia). Apagá-lo em nome do "sai do menu principal"
 * deixaria as quatro sem porta.
 */
export const SECTIONS: Section[] = [
  { id: "inicio", label: "Visão geral", icon: "house", href: "/", desc: "O mês em uma tela", items: [] },
  /*
   * ⚠️ REORGANIZAÇÃO DOS MENUS (19/10/2026, aprovada pelo dono): 58 linhas →
   * 48, nenhuma função repetida. A regra foi uma só: UMA PERGUNTA, UMA LINHA.
   * Telas que respondiam a mesma pergunta viraram ABAS de uma tela (Vendas,
   * Contas e cartões, Aprovações e baixas, Enviar ao contador, Orçamento,
   * Multiempresas, Simuladores), e os endereços antigos respondem 308 para a
   * aba certa (`core/rotas/aliases`). A ordem segue o ciclo do dinheiro:
   * vender e receber, comprar e pagar, o caixa que sobra, o registro contábil,
   * a leitura do resultado, a inteligência.
   */
  {
    // O ciclo da RECEITA, do pedido ao dinheiro. Vem primeiro: é por onde o
    // dinheiro entra, e é a pergunta que o dono faz antes de qualquer outra.
    // ⚠️ A linha "Vendas" (/dashboard/sales-invoices) saiu do menu a pedido do
    // dono (26/10/2026), que quer o Painel de vendas enxuto, sem abas internas.
    // A tela continua no ar (pedidos, boletos e PIX, links, maquininha, taxas):
    // a busca (⌘K), o Criar e o "Nova venda" levam a ela.
    id: "contas-a-receber", label: "Central de vendas", icon: "arrow-up",
    acao: { label: "Nova venda", href: "/dashboard/sales-invoices/new", icon: "plus" },
    items: [
      { label: "Painel de vendas", desc: "Calendário, status e títulos a receber numa tela só", href: "/contas-a-receber/painel-de-vendas", icon: "gauge" },
      { label: "Maquininha Quattro", desc: "Vendas, taxas e recebíveis da maquininha Pinbank", href: "/contas-a-receber/maquininha", icon: "smartphone" },
      { label: "Notas fiscais", desc: "As notas das vendas, e o botão de emitir NFS-e", href: "/dashboard/sales-invoices/invoices", icon: "file-text" },
      { label: "Cobrança e inadimplência", desc: "Régua de cobrança e risco por cliente", href: "/dashboard/financial/overdue", icon: "triangle-alert" },
      { label: "Cobrança automática", desc: "E-mail ao cliente antes, no dia e depois do vencimento", href: "/contas-a-receber/cobranca-automatica", icon: "mail" },
      { label: "Assinaturas e contratos", desc: "Receita recorrente, churn e contratos de cliente", href: "/dashboard/sales-invoices/subscriptions", icon: "repeat" },
    ],
  },
  {
    // O ciclo da DESPESA, do pedido de compra ao título pago — o ESPELHO da
    // Central de vendas (pedido do dono, 27/10/2026): quem aprendeu um lado
    // sabe usar o outro. Mesma ordem, linha a linha: o painel único (calendário,
    // status, títulos e a lista de compras, como o de vendas tem a de vendas) ·
    // o canal próprio (folha, como a maquininha) · os documentos fiscais (o que
    // chegou: NFs da SEFAZ e boletos do DDA, como as notas emitidas) · o que
    // espera decisão (reembolsos, como a cobrança) · o que se repete (contas
    // recorrentes e contratos de fornecedor, como assinaturas e contratos).
    // Painel de contas a pagar, Títulos a pagar e Compras responderam 308 para
    // o Painel de despesas.
    id: "contas-a-pagar", label: "Central de despesas", icon: "arrow-down",
    acao: { label: "Nova despesa", href: "/dashboard/financial/payables/new", icon: "plus" },
    items: [
      { label: "Painel de despesas", desc: "Calendário, status, títulos a pagar e compras numa tela só", href: "/contas-a-pagar/painel-de-despesas", icon: "gauge" },
      { label: "Folha salarial", desc: "Quem custa quanto, e o que vence quando", href: "/contas-a-pagar/folha", icon: "users" },
      { label: "Caixa de entrada", desc: "Documentos lidos, NFs da SEFAZ e boletos do DDA", href: "/contas-a-pagar/caixa-de-entrada", icon: "file-text" },
      { label: "Reembolsos", desc: "Despesa do colaborador, à espera de aprovação", href: "/dashboard/financial/reimbursements", icon: "receipt" },
      { label: "Contas recorrentes", desc: "O que se repete, e os contratos de fornecedor", href: "/contas-a-pagar/recorrentes", icon: "repeat" },
    ],
  },
  {
    // "Onde está o dinheiro AGORA", e o portão por onde ele sai. Aprovações e
    // baixas mora aqui (decisão do dono): é a última porta antes do caixa.
    id: "caixa", label: "Caixa e bancos", icon: "arrow-left-right", items: [
      { label: "Extrato", desc: "O que entrou e saiu, por dia", href: "/dashboard/financial/statement", icon: "receipt" },
      { label: "Fluxo de caixa", desc: "Projeção e cenários", href: "/fluxo-caixa", icon: "activity" },
      { label: "Contas bancárias", desc: "Contas e cartões cadastrados", href: "/dashboard/registrations/bank-accounts", icon: "building" },
      { label: "Faturas do cartão", desc: "O ciclo de cada cartão", href: "/dashboard/financial/credit-card-invoices", icon: "credit-card" },
      { label: "Transferências", desc: "Dinheiro entre contas próprias", href: "/dashboard/financial/transfers", icon: "arrow-left-right" },
      { label: "Conciliação bancária", desc: "Banco × lançamentos, inclusive Open Finance", href: "/dashboard/financial/reconciliation", icon: "list-checks" },
      { label: "Entrada de dados", desc: "Conectar banco e enviar extrato", href: "/upload", icon: "upload" },
      { label: "Regras de categoria", desc: "Categorização automática na importação", href: "/upload/regras", icon: "workflow" },
      { label: "Duplicatas", desc: "Cópias já gravadas na base", href: "/upload/duplicatas", icon: "scan-line" },
      { label: "Baixas a confirmar", desc: "O que falta confirmar e baixar", href: "/central", icon: "list-checks" },
      { label: "Aprovações", desc: "Solicitações acima da alçada", href: "/aprovacoes", icon: "shield-check", pro: true },
    ],
  },
  {
    // O registro contábil e o que sai para o escritório. Os relatórios do
    // razão foram para Relatórios; o consolidado, para Multiempresas.
    id: "contabil", label: "Contabilidade", icon: "receipt", items: [
      { label: "Razão contábil", desc: "Os lançamentos em partidas dobradas", href: "/contabilidade", icon: "receipt" },
      { label: "Reconhecimento de receita", desc: "Receita diferida reconhecida mês a mês", href: "/receita", icon: "trending-up" },
      { label: "Cronogramas", desc: "Amortização e depreciação", href: "/cronogramas", icon: "layers" },
      { label: "Dimensões", desc: "Tags e o pivot do razão", href: "/dimensoes", icon: "layers" },
      { label: "Fechamento mensal", desc: "Checklist, provisões, trava e relatório do mês", href: "/dashboard/reports/monthly-closing", icon: "shield-check" },
      { label: "Impostos e obrigações", desc: "Provisão e guia do mês", href: "/dashboard/sales-invoices/tax-provisioning", icon: "receipt" },
      { label: "Razão e DRE para o contador", desc: "Planilha do razão e do DRE do período", href: "/exportar", icon: "download" },
      { label: "TXT Domínio", desc: "O movimento no layout do Domínio", href: "/dashboard/accounting/dominio-export", icon: "file-text" },
      { label: "Envio das NFs", desc: "O pacote mensal de XMLs ao contador", href: "/dashboard/accounting/nfe-export", icon: "mail" },
    ],
  },
  {
    // Como foi o resultado. O hub antigo de Relatórios saiu: ele repetia, em
    // abas, as mesmas telas que já tinham linha aqui.
    id: "analise", label: "Relatórios", icon: "trending-up", items: [
      { label: "DRE", desc: "Resultado por competência", href: "/dashboard/reports/dre", icon: "trending-up" },
      { label: "DFC", desc: "Caixa pela data de pagamento, por período e mês a mês", href: "/dashboard/reports/dfc", icon: "trending-up" },
      { label: "Balanço patrimonial", desc: "Ativo, passivo e PL em duas datas", href: "/dashboard/reports/balance-sheet", icon: "layers" },
      { label: "Análise de variação", desc: "O que mudou no mês, e por quê", href: "/dashboard/reports/variance", icon: "activity" },
      { label: "Orçamentos", desc: "O previsto, por categoria e mês", href: "/orcamento", icon: "target" },
      { label: "Planejado × Realizado", desc: "O orçado contra o que aconteceu", href: "/orcamento/realizado", icon: "target" },
      { label: "DRE multiempresas", desc: "O resultado do grupo, empresa a empresa", href: "/dashboard/reports/dre-multi", icon: "building" },
      { label: "DFC multiempresas", desc: "O caixa do grupo, empresa a empresa", href: "/dashboard/reports/dfc-multi", icon: "building" },
      { label: "Posição consolidada", desc: "Saldo e resultado do grupo, com eliminações", href: "/consolidado", icon: "building", pro: true },
      { label: "Relatório ao investidor", desc: "O relatório mensal para quem investe", href: "/investidores", icon: "mail", pro: true },
      { label: "Meus painéis", desc: "Painéis montados por você", href: "/dashboard/dashboards/custom", icon: "grip-vertical", pro: true },
    ],
  },
  {
    // ⚠️ A linha "Quattro AI" NÃO navega: ela abre o chat em tela cheia por
    // cima da tela atual (evento `a4p:open-ia`). Desde 14/10/2026 o botão
    // flutuante saiu e a conversa mora num lugar só; esta linha, o ⌘K e a
    // caixa da Home são portas para o MESMO chat. Os quatro motores são
    // páginas próprias desde 27/10/2026 (fim das abas internas), todas Pro.
    id: "inteligencia", label: "Inteligência", icon: "sparkles", items: [
      { label: "Quattro AI", desc: "Pergunte sobre seus números", href: "/quattro-ai", icon: "sparkles", event: "a4p:open-ia" },
      { label: "Risco de caixa", desc: "Runway, ruptura e stress de caixa", href: "/risco", icon: "triangle-alert", pro: true },
      { label: "Decisão", desc: "Monte Carlo e recomendações com impacto", href: "/decisao", icon: "target", pro: true },
      { label: "Saúde financeira", desc: "Score de saúde, radar e cenários", href: "/inteligencia", icon: "gauge", pro: true },
      { label: "Sugestões da IA", desc: "O que o motor recomenda fazer agora", href: "/autonomo", icon: "sparkles", pro: true },
      { label: "Posso comprar?", desc: "O que a compra faz com o seu caixa", href: "/simuladores", icon: "target" },
      { label: "Plano de contratações", desc: "O custo de cada contratação no caixa", href: "/contratacoes", icon: "users", pro: true },
      { label: "Automações", desc: "Mensagens no WhatsApp e alertas do sistema", href: "/automacoes", icon: "workflow" },
    ],
  },
  {
    // ⚠️ CADASTROS (26/10/2026, pedido do dono): quem e o que a empresa
    // registra, num grupo só. Clientes, produtos e serviços saíram da Central
    // de vendas, fornecedores de Comprar e pagar, e plano de contas, centros
    // de custo e projetos de Contabilidade — eram cadastros espalhados pelos
    // grupos onde são USADOS, e o dono os procurava num lugar com esse nome.
    // Contas bancárias fica em Caixa e bancos: a tela é o hub de contas,
    // faturas e transferências, não só o cadastro. O hub "Estrutura e
    // cadastros" continua em Configurações (guarda CAD da consistência).
    id: "cadastros", label: "Cadastros", icon: "layers", items: [
      { label: "Clientes", desc: "Quem compra, e o risco", href: "/dashboard/registrations/clients", icon: "users" },
      { label: "Produtos e serviços", desc: "O que você vende", href: "/dashboard/registrations/products", icon: "shopping-cart" },
      { label: "Fornecedores", desc: "Quem recebe, e como pagar", href: "/dashboard/registrations/suppliers", icon: "building" },
      { label: "Plano de contas", desc: "A árvore que classifica tudo", href: "/dashboard/registrations/chart-of-accounts", icon: "layers" },
      { label: "Centros de custo", desc: "Onde o gasto é alocado", href: "/dashboard/registrations/cost-centers", icon: "network" },
      { label: "Projetos", desc: "O recorte por iniciativa", href: "/dashboard/registrations/projects", icon: "target" },
    ],
  },
];

/**
 * Os itens que SÓ quem responde pela plataforma vê. Exportado porque a guarda
 * de rota duplicada precisa varrer o menu REAL — este bloco é anexado a
 * Configurações em tempo de execução, e foi por ele não ser varrido que três
 * duplicatas passaram despercebidas.
 *
 * ⚠️ Segurança (teste de isolamento) e Armazenamento (o que ainda mora no
 * navegador) vieram para cá no enxugamento do MVP: o inventário já os
 * classificava como FERRAMENTA de quem opera a plataforma, não do cliente, e
 * no menu de todo usuário eram duas linhas que ninguém sabia para que serviam.
 */
export const PLATAFORMA_ITENS: Item[] = [
  { label: "Dono da plataforma", desc: "Todos os clientes — fora da sua empresa", href: "/admin", icon: "shield-check" },
  { label: "Segurança da plataforma", desc: "Isolamento entre empresas", href: "/dashboard/administration/security", icon: "shield-check" },
  { label: "Armazenamento e backup", desc: "O que subiu, e o que não", href: "/dashboard/administration/storage", icon: "database" },
];

export const CONFIG: Section = {
  id: "config", label: "Configurações", icon: "settings", items: [
    { label: "Empresa", desc: "Razão social, endereço e fiscal", href: "/dashboard/administration/company-data", icon: "building" },
    { label: "Usuários e papéis", desc: "Quem entra, e com que papel", href: "/dashboard/administration/users", icon: "users" },
    { label: "Alçadas e papéis", desc: "Quem aprova quanto, e a trilha", href: "/governanca", icon: "shield-check", pro: true },
    // CAD (30/09/2026): os nove cadastros continuam nos grupos onde são usados;
    // esta é a ÚNICA porta que mostra a ordem entre eles e o que falta para lançar.
    { label: "Estrutura e cadastros", desc: "A ordem dos cadastros e o que falta", href: "/dashboard/registrations", icon: "layers" },
    { label: "Integrações e API", desc: "Bancos, plataformas e certificados", href: "/dashboard/administration/integrations", icon: "link" },
    { label: "Assinatura e plano", desc: "Plano, cobrança e vencimento", href: "/dashboard/administration/subscription", icon: "credit-card" },
    { label: "Logs", desc: "A trilha de auditoria assinada", href: "/dashboard/administration/audit-logs", icon: "list-checks" },
    { label: "Arquivos gerados", desc: "Os relatórios exportados, prontos para baixar", href: "/dashboard/administration/exported-reports", icon: "arrow-down-to-line" },
    { label: "Lixeira", desc: "Excluídos, ainda recuperáveis", href: "/lixeira", icon: "trash-2" },
    // ⚠️ Ajuda saiu daqui (19/10/2026): é a Central de ajuda do menu ⋮
    // (ACOES_GLOBAIS). "Nova empresa" também: criar tenant mora no seletor de
    // empresa do rodapé e no painel Criar — não é ajuste da empresa atual.
  ],
};

/* ----------------------------- PESSOA FÍSICA (PF) ----------------------------- */
export const SECTIONS_PESSOAL: Section[] = [
  {
    id: "gastos", label: "Meu dia a dia", icon: "house", items: [
      { label: "Resumo", desc: "Seu mês em uma tela", href: "/", icon: "house" },
      { label: "Extrato de pagamentos", desc: "Tudo que você pagou", href: "/contas-a-pagar/painel-de-despesas", icon: "arrow-down" },
      { label: "Minhas receitas", desc: "Tudo que você recebeu", href: "/contas-a-receber/painel-de-vendas", icon: "arrow-up" },
    ],
  },
  {
    id: "contas", label: "Contas e carteiras", icon: "credit-card", items: [
      { label: "Conectar e importar (Open Finance)", desc: "Trazer os extratos do banco", href: "/upload", icon: "upload" },
    ],
  },
  {
    id: "orcamento", label: "Orçamento e metas", icon: "target", items: [
      { label: "Planejado × Realizado", desc: "Orçamento contra o real", href: "/orcamento/realizado", icon: "target" },
      { label: "DRE", desc: "Resultado por competência", href: "/dashboard/reports/dre", icon: "trending-up" },
      { label: "Fluxo de caixa", desc: "Projeção e cenários", href: "/fluxo-caixa", icon: "trending-up" },
    ],
  },
];

export const CONFIG_PESSOAL: Section = {
  id: "config", label: "Configurações", icon: "settings", items: [
    { label: "Meu perfil", desc: "Seus dados e suas carteiras", href: "/configuracoes", icon: "settings" },
    { label: "Lixeira", desc: "Excluídos, ainda recuperáveis", href: "/lixeira", icon: "trash-2" },
  ],
};

/**
 * O menu como ele aparece para um plano — a MESMA função que a tela usa e que
 * as guardas conferem.
 *
 * ⚠️ Duas implementações da mesma filtragem (uma no componente, outra no teste)
 * divergem no primeiro ajuste, e a divergência aqui é do tipo que não aparece:
 * a guarda diria que o Simples está coberto olhando uma lista que o Simples
 * nunca vê. Um grupo que fica SEM ITENS depois do corte não é renderizado —
 * um grupo que abre para o nada é pior que um grupo ausente.
 */
export function menuDoPlano(sections: Section[], pro: boolean): Section[] {
  return sections
    .map((s) => ({ ...s, items: s.items.filter((i) => pro || !i.pro) }))
    .filter((s) => !!s.href || s.items.length > 0);
}

/**
 * A rota pertence a este destino — **por PREFIXO**.
 *
 * Serve para achar o GRUPO: `/contas-a-pagar/titulos` tem de resolver para o
 * grupo "Contas a pagar" mesmo que nenhum item aponte exatamente para ela.
 *
 * ⚠️ **NÃO serve para marcar o item ativo** — ver `itemDaRota` abaixo.
 */
export function leafAtivo(href: string | undefined, pathname: string): boolean {
  if (!href) return false;
  if (href === "/") return pathname === "/";
  const base = href.split("?")[0];
  return pathname === base || pathname.startsWith(base + "/");
}

/**
 * ESTE item é a tela aberta — **correspondência EXATA**.
 *
 * ⚠️ **O bug que isto conserta:** "Painel de contas a pagar" (`/contas-a-pagar`)
 * ficava aceso em `/contas-a-pagar/titulos`, `/recorrentes` e `/folha`, porque
 * `leafAtivo` casa por prefixo. Um item PAI de uma área cujas telas moram sob
 * ele fica permanentemente ativo, e o destaque deixa de responder "onde estou"
 * — passa a responder "em que área estou", que a barra de cima já responde.
 *
 * As duas funções existem porque as perguntas são DIFERENTES, e foi juntá-las
 * numa só que produziu o defeito: para o grupo, prefixo; para o item, exato.
 */
export function itemDaRota(href: string | undefined, pathname: string): boolean {
  if (!href) return false;
  return pathname === href.split("?")[0];
}

/**
 * QUAL item da lista está na tela — e aqui a QUERY importa.
 *
 * ⚠️ `leafAtivo` descarta o `?tab=` de propósito: para achar o GRUPO, qualquer
 * aba de `accounts-and-transfers` serve. Para achar o ITEM, não: três linhas
 * ("Títulos a receber", "Títulos a pagar", "Transferências") apontam para o
 * MESMO caminho e diferem só na aba, e usar `leafAtivo` marcava as três ao
 * mesmo tempo. Enquanto o selecionado era um cinza discreto isso passou; com o
 * degradê da marca no tile, três acentos acesos de uma vez viram um erro
 * visível — e continuavam sendo uma resposta errada à pergunta "onde estou".
 *
 * Devolve o ÍNDICE (não um booleano por item) porque a decisão só existe
 * olhando a lista inteira: sem `?tab=` na URL o hub abre na PRIMEIRA aba, e um
 * item sozinho não tem como saber que é ele.
 */
export function indiceItemAtivo(itens: Item[], pathname: string, busca: string): number {
  const porPrefixo = itens
    .map((it, i) => ({ it, i }))
    .filter(({ it }) => leafAtivo(it.href, pathname));
  // ⚠️ **O EXATO VENCE O PREFIXO.** Em `/contas-a-pagar/titulos` os dois itens
  // casam por prefixo — o painel (`/contas-a-pagar`) e a própria tela — e o
  // desempate por query não resolvia (nenhum dos dois TEM query), então caía no
  // primeiro da lista e o painel ficava preso aceso nas quatro telas da área.
  // Quando existe item apontando EXATAMENTE para a rota, é ele; o prefixo só
  // sobrevive para a sub-rota que nenhum item declara (`.../products/new`),
  // onde marcar o pai é a resposta certa.
  const exatos = porPrefixo.filter(({ it }) => itemDaRota(it.href, pathname));
  const candidatos = exatos.length > 0 ? exatos : porPrefixo;
  if (candidatos.length <= 1) return candidatos[0]?.i ?? -1;

  const atual = new URLSearchParams(busca);
  const exato = candidatos.find(({ it }) => {
    const q = (it.href ?? "").split("?")[1];
    if (!q) return false;
    // `forEach` e não `for…of`: o alvo de compilação do projeto não itera
    // `URLSearchParams` diretamente, e o espalhamento quebra o typecheck.
    let bate = true;
    new URLSearchParams(q).forEach((v, k) => { if (atual.get(k) !== v) bate = false; });
    return bate;
  });
  // Nenhum casou: a URL veio sem o parâmetro, e o hub abre na primeira aba.
  return exato ? exato.i : candidatos[0].i;
}

/**
 * O grupo que responde pela rota atual.
 *
 * ⚠️ Isto é UMA função porque a navegação passou a ter DUAS superfícies: a
 * barra horizontal (que grupo está ativo) e a lateral (quais itens mostrar).
 * Cada uma derivando o grupo por conta própria é a receita para a barra
 * destacar "Relatórios" enquanto a lateral lista Cadastros — e o usuário não
 * tem como saber qual das duas está certa. As duas chamam daqui.
 *
 * Devolve `null` quando a rota não pertence a grupo nenhum (as telas de
 * `ACOES_GLOBAIS`, que têm porta própria): aí nenhuma aba fica marcada, que é
 * a verdade — você não está em nenhum grupo.
 */
export function grupoDaRota(sections: Section[], pathname: string): Section | null {
  return (
    sections.find(
      (s) => (s.href && leafAtivo(s.href, pathname)) || s.items.some((i) => leafAtivo(i.href, pathname)),
    ) ?? null
  );
}

/**
 * Resolve as seções visíveis para o usuário atual (PF/PJ · Simples/Pro · admin).
 * `sections` já vem na ordem de exibição, com Configurações por último.
 */
export function useNavSections(): { sections: Section[]; pessoal: boolean } {
  const { pro } = useModo();
  const { pessoal } = useTipoConta();
  const [admin, setAdmin] = React.useState(false);
  React.useEffect(() => { isPlatformAdmin().then(setAdmin).catch(() => setAdmin(false)); }, []);

  // PF tem a sua árvore; PJ esconde os ITENS `pro` no Modo Simples.
  const base = menuDoPlano(pessoal ? SECTIONS_PESSOAL : SECTIONS, pro);
  const configBase = menuDoPlano([pessoal ? CONFIG_PESSOAL : CONFIG], pro)[0];
  /**
   * ⚠️ FERRAMENTA DE ENGENHARIA NÃO MORA NAS CONFIGURAÇÕES DO CLIENTE.
   *
   * "Inventário de rotas", "Armazenamento" e "Segurança e isolamento" estavam
   * em `CONFIG`, visíveis para TODO usuário. Nenhum cliente vai usá-las, e as
   * três expõem detalhe interno do produto — a lista de rotas publicadas, as
   * chaves que ainda vivem no navegador, o resultado do teste de isolamento.
   * Elas não foram apagadas: mudaram de casa para o painel de plataforma, onde
   * já vive quem responde por elas. É o mesmo gate de `isPlatformAdmin` que já
   * governava "Administração".
   */
  /*
   * ⚠️ SÓ O QUE É DE PLATAFORMA, E SÓ UMA VEZ.
   *
   * Esta lista carregava quatro itens, e três viraram DUPLICATA quando o
   * rodapé de Configurações foi redesenhado: `storage` e `security` passaram a
   * ser itens do cliente ("Armazenamento e backup", "Segurança"), e continuavam
   * aqui com outro nome — para quem administra a plataforma, o mesmo grupo
   * mostrava duas entradas para a mesma tela, com rótulos diferentes. É o
   * defeito das portas duplicadas que este repositório passou ondas removendo,
   * reintroduzido pela porta dos fundos: a guarda de rota duplicada varre
   * `SECTIONS`/`CONFIG` estáticos e não via esta lista, que é anexada em
   * tempo de execução.
   *
   * O "Inventário de rotas" saiu por outro motivo: ele mudou de casa para
   * `/admin`, onde ganhou porta própria. Mantê-lo aqui seria "mover" que não
   * move nada.
   */
  const FERRAMENTAS_DE_PLATAFORMA: Item[] = PLATAFORMA_ITENS;
  const config: Section = {
    ...configBase,
    items: [...configBase.items, ...(admin ? FERRAMENTAS_DE_PLATAFORMA : [])],
  };
  return { sections: [...base, config], pessoal };
}
