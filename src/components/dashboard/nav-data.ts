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
  { rota: "/comece", onde: "menu ⋮ da barra superior + o cartão da Jornada na Home" },
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
  { id: "inicio", label: "Início", icon: "house", href: "/", items: [] },
  {
    id: "movimentacoes", label: "Movimentações", icon: "arrow-left-right", items: [
      { label: "Títulos a receber", desc: "O que os clientes ainda devem", href: "/dashboard/financial/accounts-and-transfers?tab=receivables", icon: "arrow-left-right" },
      { label: "Títulos a pagar", desc: "O que a empresa ainda deve", href: "/dashboard/financial/accounts-and-transfers?tab=payables", icon: "arrow-up-right" },
      { label: "Transferências", desc: "Dinheiro entre contas próprias", href: "/dashboard/financial/accounts-and-transfers?tab=transfers", icon: "repeat" },
      { label: "Conciliação bancária", desc: "Banco × lançamentos", href: "/dashboard/financial/reconciliation", icon: "list-checks" },
      { label: "Extrato", desc: "O que entrou e saiu, por dia", href: "/dashboard/financial/statement", icon: "receipt" },
      { label: "Fatura do cartão", desc: "Compras agrupadas por ciclo", href: "/dashboard/financial/credit-card-invoices", icon: "credit-card" },
      // Inadimplência é OPERACIONAL (quem me deve), não recurso pago. Vivia
      // duplicada no grupo Pro, o que a tornava paga num menu e grátis no hub.
      { label: "Inadimplência", desc: "Quem está atrasado, e o risco", href: "/dashboard/financial/overdue", icon: "triangle-alert" },
      // Aprovar pagamento é o que se faz COM o dinheiro — mora ao lado dele, e
      // não num grupo separado só porque é pago.
      { label: "Solicitações & aprovações", desc: "O que depende de alçada", href: "/aprovacoes", icon: "list-checks", pro: true },
    ],
  },
  {
    id: "entradas", label: "Entradas", icon: "upload", items: [
      { label: "Upload de dados", desc: "Conectar banco e enviar extrato", href: "/upload", icon: "upload" },
      { label: "Vendas", desc: "Pedidos, status e taxas", href: "/dashboard/sales-invoices", icon: "shopping-cart" },
      { label: "Assinaturas e contratos", desc: "Receita recorrente e churn", href: "/dashboard/sales-invoices/subscriptions", icon: "repeat" },
      { label: "Notas fiscais", desc: "Emitidas, a emitir e com erro", href: "/dashboard/sales-invoices/invoices", icon: "file-text" },
      { label: "Links de pagamento", desc: "Cobrança por link", href: "/dashboard/sales-invoices/payment-links", icon: "link" },
      { label: "Compras", desc: "Pedidos que passam por aprovação", href: "/dashboard/purchases", icon: "inbox" },
      { label: "Boletos recebidos", desc: "DDA: o que chegou para pagar", href: "/dashboard/purchases/received-boletos", icon: "file-text" },
      { label: "NFs recebidas", desc: "XMLs de entrada da SEFAZ", href: "/dashboard/purchases/received-invoices", icon: "receipt" },
    ],
  },
  {
    id: "relatorios", label: "Relatórios", icon: "trending-up", items: [
      { label: "DRE", desc: "Resultado por competência", href: "/dashboard/reports/dre", icon: "trending-up" },
      { label: "DFC", desc: "Caixa pela data de pagamento", href: "/dashboard/reports/dfc", icon: "trending-up" },
      { label: "Fluxo de caixa", desc: "Projeção e cenários", href: "/fluxo-caixa", icon: "activity" },
      { label: "Planejado × Realizado", desc: "Orçamento contra o real", href: "/orcamento", icon: "target" },
      { label: "DRE multiempresas", desc: "Resultado consolidado do grupo", href: "/dashboard/reports/dre-multi", icon: "building" },
      { label: "DFC multiempresas", desc: "Caixa consolidado do grupo", href: "/dashboard/reports/dfc-multi", icon: "building" },
      { label: "Consolidado", desc: "Posição somada das empresas", href: "/contabilidade?aba=consolidado", icon: "building", pro: true },
      { label: "Investor update", desc: "O relatório mensal do investidor", href: "/investidores", icon: "mail", pro: true },
      { label: "Plano de contratações", desc: "O impacto de contratar", href: "/contratacoes", icon: "users", pro: true },
      { label: "Meus dashboards", desc: "Painéis montados por você", href: "/dashboard/dashboards/custom", icon: "grip-vertical", pro: true },
    ],
  },
  {
    id: "cadastros", label: "Cadastros", icon: "database", items: [
      { label: "Clientes", desc: "Quem compra, e o risco", href: "/dashboard/registrations/clients", icon: "users" },
      { label: "Fornecedores", desc: "Quem recebe, e como pagar", href: "/dashboard/registrations/suppliers", icon: "building" },
      // ⚠️ Era `icon: "b"` — não é nome de ícone, é uma CHAVE da estrutura de
      // dados do conjunto (`{ b, w, h }`), colhida por engano ao montar a
      // lista. Passou despercebido porque a lateral não desenhava o ícone dos
      // itens; com a navegação em dois níveis ela desenha, e a linha aparecia
      // sem glifo nenhum ao lado das outras sete.
      { label: "Produtos e serviços", desc: "O que você vende", href: "/dashboard/registrations/products", icon: "shopping-cart" },
      { label: "Contas bancárias", desc: "Contas, carteiras e cartões", href: "/dashboard/registrations/bank-accounts", icon: "credit-card" },
      { label: "Plano de contas", desc: "A árvore que classifica tudo", href: "/dashboard/registrations/chart-of-accounts", icon: "layers" },
      { label: "Centros de custo", desc: "Onde o gasto é alocado", href: "/dashboard/registrations/cost-centers", icon: "network" },
      { label: "Projetos", desc: "O recorte por iniciativa", href: "/dashboard/registrations/projects", icon: "target" },
      { label: "Contratos", desc: "Vigência, rateio e faturas previstas", href: "/dashboard/registrations/contracts", icon: "file-text" },
    ],
  },
  {
    id: "contabil", label: "Contabilidade e impostos", icon: "receipt", items: [
      { label: "Impostos sobre vendas", desc: "Provisão e guia do mês", href: "/dashboard/sales-invoices/tax-provisioning", icon: "receipt" },
      { label: "Fechamento mensal", desc: "Fechar e travar o mês", href: "/dashboard/reports/monthly-closing", icon: "shield-check" },
      { label: "Contabilidade", desc: "Razão e balancete", href: "/contabilidade", icon: "layers" },
      { label: "Envio das NFs ao contador", desc: "O pacote mensal de XMLs", href: "/dashboard/accounting/nfe-export", icon: "mail" },
      { label: "Gerar TXT contábil", desc: "O arquivo para o sistema Domínio", href: "/dashboard/accounting/dominio-export", icon: "file-text" },
    ],
  },
];

export const CONFIG: Section = {
  id: "config", label: "Configurações", icon: "settings", items: [
    { label: "Assinatura", desc: "Plano, cobrança e vencimento", href: "/dashboard/administration/subscription", icon: "credit-card" },
    { label: "Nova empresa", desc: "Abrir outra organização", href: "/empresas/nova", icon: "building" },
    { label: "Dados da empresa", desc: "Razão social, endereço e fiscal", href: "/dashboard/administration/company-data", icon: "building" },
    { label: "Gerenciar usuários", desc: "Quem entra, e com que papel", href: "/dashboard/administration/users", icon: "users" },
    { label: "Logs", desc: "A trilha de auditoria assinada", href: "/dashboard/administration/audit-logs", icon: "list-checks" },
    { label: "Integrações", desc: "Bancos, plataformas e certificados", href: "/dashboard/administration/integrations", icon: "link" },
    { label: "Relatórios exportados", desc: "A fila e os arquivos gerados", href: "/dashboard/administration/exported-reports", icon: "arrow-down-to-line" },
    // Alçadas, papéis e a trilha assinada são ADMINISTRAÇÃO, não um assunto do
    // dia a dia — vieram do grupo "Governança", que existia por preço.
    { label: "Governança e auditoria", desc: "Alçadas, papéis e isolamento", href: "/governanca", icon: "shield-check", pro: true },
    { label: "Configurações da empresa", desc: "Perfil e estrutura financeira", href: "/configuracoes", icon: "settings" },
    { label: "Lixeira", desc: "Excluídos, ainda recuperáveis", href: "/lixeira", icon: "trash-2" },
  ],
};

/* ----------------------------- PESSOA FÍSICA (PF) ----------------------------- */
export const SECTIONS_PESSOAL: Section[] = [
  {
    id: "gastos", label: "Meu dia a dia", icon: "house", items: [
      { label: "Resumo", desc: "Seu mês em uma tela", href: "/", icon: "house" },
      { label: "Extrato de pagamentos", desc: "Tudo que você pagou", href: "/dashboard/financial/accounts-and-transfers?tab=payables", icon: "arrow-up-right" },
      { label: "Minhas receitas", desc: "Tudo que você recebeu", href: "/dashboard/financial/accounts-and-transfers?tab=receivables", icon: "arrow-left-right" },
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
