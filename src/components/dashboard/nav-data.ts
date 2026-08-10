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
};

/**
 * As telas que NÃO estão no menu porque têm uma porta melhor.
 *
 * ⚠️ Isto não é uma lista de exceções para calar a guarda — é a declaração de
 * ONDE cada uma mora. Uma tela sem porta nenhuma é uma tela que só existe para
 * quem já sabe o endereço; uma tela com porta global e mais uma linha de menu é
 * a duplicata que produziu seis entradas para a mesma IA. A guarda de
 * navegação aceita estas quatro e só estas, e cobra a porta declarada.
 */
export const ACOES_GLOBAIS: { rota: string; onde: string }[] = [
  { rota: "/all4pay-ai", onde: "botão flutuante da IA, presente em toda tela, + ⌘K" },
  { rota: "/dashboard/help", onde: "menu ⋮ da barra superior" },
  { rota: "/comece", onde: "aba Primeiros passos na Central de ajuda + menu ⋮ da barra superior" },
  { rota: "/configuracoes", onde: "menu ⋮ da barra superior (Meu perfil)" },
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
  {
    // A pergunta é "onde está o dinheiro AGORA". Chamava-se "Movimentações", e
    // movimentação não descreve um título em aberto — descreve o extrato.
    id: "caixa", label: "Caixa e bancos", icon: "arrow-left-right", items: [
      { label: "Extrato", desc: "O que entrou e saiu, por dia", href: "/dashboard/financial/statement", icon: "receipt" },
      { label: "Conciliação bancária", desc: "Banco × lançamentos", href: "/dashboard/financial/reconciliation", icon: "list-checks" },
      { label: "Fluxo de caixa", desc: "Projeção e cenários", href: "/fluxo-caixa", icon: "activity" },
      { label: "Transferências", desc: "Dinheiro entre contas próprias", href: "/dashboard/financial/accounts-and-transfers?tab=transfers", icon: "repeat" },
      { label: "Contas bancárias", desc: "Contas, carteiras e cartões", href: "/dashboard/registrations/bank-accounts", icon: "credit-card" },
      { label: "Fatura do cartão", desc: "Compras agrupadas por ciclo", href: "/dashboard/financial/credit-card-invoices", icon: "credit-card" },
      // Upload, OCR, Open Finance, regras e duplicatas são ABAS desta tela —
      // uma porta só para tudo que ENTRA no sistema.
      { label: "Entrada de dados", desc: "Conectar banco e enviar extrato", href: "/upload", icon: "upload" },
    ],
  },
  {
    id: "receber", label: "Receber", icon: "arrow-up", items: [
      { label: "Contas a receber", desc: "O que os clientes ainda devem", href: "/dashboard/financial/accounts-and-transfers?tab=receivables", icon: "arrow-up" },
      { label: "Boletos e PIX", desc: "Cobrança emitida", href: "/dashboard/financial/boletos", icon: "file-text" },
      { label: "Links de pagamento", desc: "Cobrança por link", href: "/dashboard/sales-invoices/payment-links", icon: "link" },
      { label: "Assinaturas e recorrência", desc: "Receita recorrente e churn", href: "/dashboard/sales-invoices/subscriptions", icon: "repeat" },
      { label: "Inadimplência e cobrança", desc: "Quem está atrasado, e o risco", href: "/dashboard/financial/overdue", icon: "triangle-alert" },
      { label: "Clientes", desc: "Quem compra, e o risco", href: "/dashboard/registrations/clients", icon: "users" },
    ],
  },
  {
    id: "pagar", label: "Pagar", icon: "arrow-down", items: [
      { label: "Contas a pagar", desc: "O que a empresa ainda deve", href: "/dashboard/financial/accounts-and-transfers?tab=payables", icon: "arrow-down" },
      { label: "Compras", desc: "Pedidos que passam por aprovação", href: "/dashboard/purchases", icon: "inbox" },
      { label: "Aprovações", desc: "O que depende de alçada", href: "/aprovacoes", icon: "list-checks", pro: true },
      { label: "NFs recebidas", desc: "XMLs de entrada da SEFAZ", href: "/dashboard/purchases/received-invoices", icon: "receipt" },
      { label: "Boletos recebidos (DDA)", desc: "O que chegou para pagar", href: "/dashboard/purchases/received-boletos", icon: "file-text" },
      { label: "Reembolsos", desc: "Despesa do colaborador", href: "/dashboard/financial/reimbursements", icon: "receipt" },
      { label: "Fornecedores", desc: "Quem recebe, e como pagar", href: "/dashboard/registrations/suppliers", icon: "building" },
    ],
  },
  {
    id: "vender", label: "Vender", icon: "shopping-cart", items: [
      { label: "Painel de vendas", desc: "Pedidos, status e taxas", href: "/dashboard/sales-invoices", icon: "shopping-cart" },
      { label: "Nova venda", desc: "Registrar uma venda", href: "/dashboard/sales-invoices/new", icon: "plus" },
      // ⚠️ Aponta para a ABA, não para `/pos/venda`: aquela rota é um
      // redirecionamento de cliente, e um item de menu que leva a um redirect
      // pisca uma tela em branco antes de chegar ao destino.
      { label: "Maquininha (POS)", desc: "Venda no balcão", href: "/vendas?aba=pos", icon: "credit-card" },
      { label: "Taxas de adquirência", desc: "Quanto a maquininha leva", href: "/vendas?aba=pos-taxas", icon: "credit-card" },
      { label: "Notas fiscais emitidas", desc: "Emitidas, a emitir e com erro", href: "/dashboard/sales-invoices/invoices", icon: "file-text" },
      { label: "Produtos e serviços", desc: "O que você vende", href: "/dashboard/registrations/products", icon: "shopping-cart" },
    ],
  },
  {
    // ⚠️ O grupo aponta para `/contabilidade` (a primeira aba é o Razão), e
    // não mais para a tela de impostos sobre vendas: o módulo contábil existia
    // e o menu levava a um pedaço dele.
    id: "contabil", label: "Contábil e fiscal", icon: "receipt", items: [
      { label: "Razão contábil", desc: "Lançamentos em dupla entrada", href: "/contabilidade?aba=razao", icon: "receipt" },
      { label: "Plano de contas", desc: "A árvore que classifica tudo", href: "/dashboard/registrations/chart-of-accounts", icon: "layers" },
      { label: "Centros de custo", desc: "Onde o gasto é alocado", href: "/dashboard/registrations/cost-centers", icon: "network" },
      { label: "Projetos", desc: "O recorte por iniciativa", href: "/dashboard/registrations/projects", icon: "target" },
      { label: "Dimensões & tags", desc: "Outros recortes do lançamento", href: "/contabilidade?aba=dimensoes", icon: "layers" },
      { label: "Reconhecimento de receita", desc: "Quando a receita é da empresa", href: "/contabilidade?aba=receita", icon: "trending-up" },
      { label: "Cronogramas", desc: "Competência distribuída no tempo", href: "/contabilidade?aba=cronogramas", icon: "calendar" },
      { label: "Fechamento mensal", desc: "Fechar e travar o mês", href: "/dashboard/reports/monthly-closing", icon: "shield-check" },
      { label: "Impostos e obrigações", desc: "Provisão e guia do mês", href: "/dashboard/sales-invoices/tax-provisioning", icon: "receipt" },
      { label: "Envio das NFs ao contador", desc: "O pacote mensal de XMLs", href: "/dashboard/accounting/nfe-export", icon: "mail" },
      { label: "Gerar TXT contábil", desc: "O arquivo para o sistema Domínio", href: "/dashboard/accounting/dominio-export", icon: "file-text" },
      { label: "Consolidado", desc: "Posição somada das empresas", href: "/contabilidade?aba=consolidado", icon: "building", pro: true },
    ],
  },
  {
    id: "analise", label: "Análise e relatórios", icon: "trending-up", items: [
      { label: "DRE", desc: "Resultado por competência", href: "/dashboard/reports/dre", icon: "trending-up" },
      { label: "DFC", desc: "Caixa pela data de pagamento", href: "/dashboard/reports/dfc", icon: "trending-up" },
      { label: "Fluxo de caixa (relatório)", desc: "O mês fechado, linha a linha", href: "/dashboard/reports/cash-flow", icon: "activity" },
      { label: "Planejado × Realizado", desc: "Orçamento contra o real", href: "/orcamento", icon: "target" },
      { label: "Orçamentos", desc: "O previsto, por categoria e mês", href: "/dashboard/registrations/budgets", icon: "target" },
      { label: "DRE multiempresas", desc: "Resultado consolidado do grupo", href: "/dashboard/reports/dre-multi", icon: "building" },
      { label: "DFC multiempresas", desc: "Caixa consolidado do grupo", href: "/dashboard/reports/dfc-multi", icon: "building" },
      { label: "Investor update", desc: "O relatório mensal do investidor", href: "/investidores", icon: "mail", pro: true },
      { label: "Meus dashboards", desc: "Painéis montados por você", href: "/dashboard/dashboards/custom", icon: "grip-vertical", pro: true },
      { label: "Relatórios exportados", desc: "A fila e os arquivos gerados", href: "/dashboard/administration/exported-reports", icon: "arrow-down-to-line" },
    ],
  },
  {
    // ⚠️ A IA passou a ter LINHA DE MENU, e isso reverte uma decisão anterior
    // (ela vivia só no botão flutuante + ⌘K, para não repetir as seis portas
    // que já foram removidas). Com um grupo próprio, os quatro motores param
    // de ser abas invisíveis de um chat — mas o preço é uma segunda porta para
    // a conversa. Se voltar a incomodar, o que sai é a LINHA, não o botão.
    id: "inteligencia", label: "Inteligência", icon: "sparkles", items: [
      { label: "All 4 Pay AI", desc: "Pergunte sobre seus números", href: "/all4pay-ai", icon: "sparkles" },
      { label: "Risco de crédito", desc: "Quem tende a não pagar", href: "/all4pay-ai?aba=risco", icon: "triangle-alert", pro: true },
      { label: "Motor de decisão", desc: "O que fazer, com o impacto", href: "/all4pay-ai?aba=decisao", icon: "target", pro: true },
      { label: "Operação autônoma", desc: "O que o sistema propõe agir", href: "/all4pay-ai?aba=autonomo", icon: "activity", pro: true },
      { label: "Plano de contratações", desc: "O impacto de contratar", href: "/contratacoes", icon: "users", pro: true },
    ],
  },
];

export const CONFIG: Section = {
  id: "config", label: "Configurações", icon: "settings", items: [
    { label: "Empresa", desc: "Razão social, endereço e fiscal", href: "/dashboard/administration/company-data", icon: "building" },
    { label: "Usuários e papéis", desc: "Quem entra, e com que papel", href: "/dashboard/administration/users", icon: "users" },
    { label: "Governança e aprovações", desc: "Alçadas, papéis e trilha", href: "/governanca", icon: "shield-check", pro: true },
    { label: "Integrações e API", desc: "Bancos, plataformas e certificados", href: "/dashboard/administration/integrations", icon: "link" },
    { label: "Segurança", desc: "Isolamento entre empresas", href: "/dashboard/administration/security", icon: "shield-check" },
    { label: "Armazenamento e backup", desc: "O que subiu, e o que não", href: "/dashboard/administration/storage", icon: "database" },
    { label: "Logs", desc: "A trilha de auditoria assinada", href: "/dashboard/administration/audit-logs", icon: "list-checks" },
    { label: "Assinatura e plano", desc: "Plano, cobrança e vencimento", href: "/dashboard/administration/subscription", icon: "credit-card" },
    { label: "Lixeira", desc: "Excluídos, ainda recuperáveis", href: "/lixeira", icon: "trash-2" },
    { label: "Ajuda", desc: "Chat, tours e anúncios", href: "/dashboard/help", icon: "help-circle" },
    // ⚠️ "Nova empresa" fica no FIM e fora do bloco de configuração da empresa
    // atual: criar tenant não é ajustar um campo — é uma organização com
    // isolamento, membros e cobrança próprios.
    { label: "Nova empresa", desc: "Abrir outra organização", href: "/empresas/nova", icon: "building" },
    { label: "Configurações da empresa", desc: "Perfil e estrutura financeira", href: "/configuracoes", icon: "settings" },
  ],
};

/* ----------------------------- PESSOA FÍSICA (PF) ----------------------------- */
export const SECTIONS_PESSOAL: Section[] = [
  {
    id: "gastos", label: "Meu dia a dia", icon: "house", items: [
      { label: "Resumo", desc: "Seu mês em uma tela", href: "/", icon: "house" },
      { label: "Extrato de pagamentos", desc: "Tudo que você pagou", href: "/dashboard/financial/accounts-and-transfers?tab=payables", icon: "arrow-down" },
      { label: "Minhas receitas", desc: "Tudo que você recebeu", href: "/dashboard/financial/accounts-and-transfers?tab=receivables", icon: "arrow-up" },
    ],
  },
  {
    id: "contas", label: "Contas & carteiras", icon: "credit-card", items: [
      { label: "Conectar & importar (Open finance)", desc: "Trazer os extratos do banco", href: "/upload", icon: "upload" },
    ],
  },
  {
    id: "orcamento", label: "Orçamento & metas", icon: "target", items: [
      { label: "Planejado × Realizado", desc: "Orçamento contra o real", href: "/orcamento", icon: "target" },
      { label: "DRE", desc: "Resultado por competência", href: "/dashboard/reports/dre", icon: "trending-up" },
      { label: "Fluxo de caixa", desc: "Projeção e cenários", href: "/fluxo-caixa", icon: "trending-up" },
    ],
  },
];

export const CONFIG_PESSOAL: Section = {
  id: "config", label: "Configurações", icon: "settings", items: [
    { label: "Configurações da empresa", desc: "Perfil e estrutura financeira", href: "/configuracoes", icon: "settings" },
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

/** Item ativo: rota exata (ou prefixo de sub-rota); `/` só casa com `/`. */
export function leafAtivo(href: string | undefined, pathname: string): boolean {
  if (!href) return false;
  if (href === "/") return pathname === "/";
  const base = href.split("?")[0];
  return pathname === base || pathname.startsWith(base + "/");
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
  const candidatos = itens
    .map((it, i) => ({ it, i }))
    .filter(({ it }) => leafAtivo(it.href, pathname));
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
  const FERRAMENTAS_DE_PLATAFORMA: Item[] = [
    { label: "Administração", desc: "Todos os clientes da plataforma", href: "/admin", icon: "shield-check" },
    { label: "Inventário de rotas", desc: "Rota, dono e status", href: "/dashboard/administration/routes", icon: "network" },
    { label: "Armazenamento", desc: "O que subiu, e o que não", href: "/dashboard/administration/storage", icon: "database" },
    { label: "Segurança e isolamento", desc: "Isolamento entre empresas", href: "/dashboard/administration/security", icon: "shield-check" },
  ];
  const config: Section = {
    ...configBase,
    items: [...configBase.items, ...(admin ? FERRAMENTAS_DE_PLATAFORMA : [])],
  };
  return { sections: [...base, config], pessoal };
}
