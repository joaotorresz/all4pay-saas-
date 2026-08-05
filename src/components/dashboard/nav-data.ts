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
      { label: "Títulos a receber", href: "/dashboard/financial/accounts-and-transfers?tab=receivables", icon: "arrow-left-right" },
      { label: "Títulos a pagar", href: "/dashboard/financial/accounts-and-transfers?tab=payables", icon: "arrow-up-right" },
      { label: "Transferências", href: "/dashboard/financial/accounts-and-transfers?tab=transfers", icon: "repeat" },
      { label: "Conciliação bancária", href: "/dashboard/financial/reconciliation", icon: "list-checks" },
      { label: "Extrato", href: "/dashboard/financial/statement", icon: "receipt" },
      { label: "Fatura do cartão", href: "/dashboard/financial/credit-card-invoices", icon: "credit-card" },
      // Inadimplência é OPERACIONAL (quem me deve), não recurso pago. Vivia
      // duplicada no grupo Pro, o que a tornava paga num menu e grátis no hub.
      { label: "Inadimplência", href: "/dashboard/financial/overdue", icon: "triangle-alert" },
      // Aprovar pagamento é o que se faz COM o dinheiro — mora ao lado dele, e
      // não num grupo separado só porque é pago.
      { label: "Solicitações & aprovações", href: "/aprovacoes", icon: "list-checks", pro: true },
    ],
  },
  {
    id: "entradas", label: "Entradas", icon: "upload", items: [
      { label: "Upload de dados", href: "/upload", icon: "upload" },
      { label: "Vendas", href: "/dashboard/sales-invoices", icon: "shopping-cart" },
      { label: "Assinaturas e contratos", href: "/dashboard/sales-invoices/subscriptions", icon: "repeat" },
      { label: "Notas fiscais", href: "/dashboard/sales-invoices/invoices", icon: "file-text" },
      { label: "Links de pagamento", href: "/dashboard/sales-invoices/payment-links", icon: "link" },
      { label: "Compras", href: "/dashboard/purchases", icon: "inbox" },
      { label: "Boletos recebidos", href: "/dashboard/purchases/received-boletos", icon: "file-text" },
      { label: "NFs recebidas", href: "/dashboard/purchases/received-invoices", icon: "receipt" },
    ],
  },
  {
    id: "relatorios", label: "Relatórios", icon: "trending-up", items: [
      { label: "DRE", href: "/dashboard/reports/dre", icon: "trending-up" },
      { label: "DFC", href: "/dashboard/reports/dfc", icon: "trending-up" },
      { label: "Fluxo de caixa", href: "/fluxo-caixa", icon: "activity" },
      { label: "Planejado × Realizado", href: "/orcamento", icon: "target" },
      { label: "DRE multiempresas", href: "/dashboard/reports/dre-multi", icon: "building" },
      { label: "DFC multiempresas", href: "/dashboard/reports/dfc-multi", icon: "building" },
      { label: "Consolidado", href: "/contabilidade?aba=consolidado", icon: "building", pro: true },
      { label: "Investor update", href: "/investidores", icon: "mail", pro: true },
      { label: "Plano de contratações", href: "/contratacoes", icon: "users", pro: true },
      { label: "Meus dashboards", href: "/dashboard/dashboards/custom", icon: "grip-vertical", pro: true },
    ],
  },
  {
    id: "cadastros", label: "Cadastros", icon: "database", items: [
      { label: "Clientes", href: "/dashboard/registrations/clients", icon: "users" },
      { label: "Fornecedores", href: "/dashboard/registrations/suppliers", icon: "building" },
      { label: "Produtos e serviços", href: "/dashboard/registrations/products", icon: "b" },
      { label: "Contas bancárias", href: "/dashboard/registrations/bank-accounts", icon: "credit-card" },
      { label: "Plano de contas", href: "/dashboard/registrations/chart-of-accounts", icon: "layers" },
      { label: "Centros de custo", href: "/dashboard/registrations/cost-centers", icon: "network" },
      { label: "Projetos", href: "/dashboard/registrations/projects", icon: "target" },
      { label: "Contratos", href: "/dashboard/registrations/contracts", icon: "file-text" },
    ],
  },
  {
    id: "contabil", label: "Contabilidade e impostos", icon: "receipt", items: [
      { label: "Impostos sobre vendas", href: "/dashboard/sales-invoices/tax-provisioning", icon: "receipt" },
      { label: "Fechamento mensal", href: "/dashboard/reports/monthly-closing", icon: "shield-check" },
      { label: "Contabilidade", href: "/contabilidade", icon: "layers" },
      { label: "Envio das NFs ao contador", href: "/dashboard/accounting/nfe-export", icon: "mail" },
      { label: "Gerar TXT contábil", href: "/dashboard/accounting/dominio-export", icon: "file-text" },
    ],
  },
];

export const CONFIG: Section = {
  id: "config", label: "Configurações", icon: "settings", items: [
    { label: "Assinatura", href: "/dashboard/administration/subscription", icon: "credit-card" },
    { label: "Nova empresa", href: "/empresas/nova", icon: "building" },
    { label: "Dados da empresa", href: "/dashboard/administration/company-data", icon: "building" },
    { label: "Gerenciar usuários", href: "/dashboard/administration/users", icon: "users" },
    { label: "Logs", href: "/dashboard/administration/audit-logs", icon: "list-checks" },
    { label: "Integrações", href: "/dashboard/administration/integrations", icon: "link" },
    { label: "Relatórios exportados", href: "/dashboard/administration/exported-reports", icon: "arrow-down-to-line" },
    // Alçadas, papéis e a trilha assinada são ADMINISTRAÇÃO, não um assunto do
    // dia a dia — vieram do grupo "Governança", que existia por preço.
    { label: "Governança e auditoria", href: "/governanca", icon: "shield-check", pro: true },
    { label: "Configurações da empresa", href: "/configuracoes", icon: "settings" },
    { label: "Lixeira", href: "/lixeira", icon: "trash-2" },
  ],
};

/* ----------------------------- PESSOA FÍSICA (PF) ----------------------------- */
export const SECTIONS_PESSOAL: Section[] = [
  {
    id: "gastos", label: "Meu dia a dia", icon: "house", items: [
      { label: "Resumo", href: "/", icon: "house" },
      { label: "Extrato de pagamentos", href: "/dashboard/financial/accounts-and-transfers?tab=payables", icon: "arrow-up-right" },
      { label: "Minhas receitas", href: "/dashboard/financial/accounts-and-transfers?tab=receivables", icon: "arrow-left-right" },
    ],
  },
  {
    id: "contas", label: "Contas & carteiras", icon: "credit-card", items: [
      { label: "Conectar & importar (Open finance)", href: "/upload", icon: "upload" },
    ],
  },
  {
    id: "orcamento", label: "Orçamento & metas", icon: "target", items: [
      { label: "Planejado × Realizado", href: "/orcamento", icon: "target" },
      { label: "DRE", href: "/dashboard/reports/dre", icon: "trending-up" },
      { label: "Fluxo de caixa", href: "/fluxo-caixa", icon: "trending-up" },
    ],
  },
];

export const CONFIG_PESSOAL: Section = {
  id: "config", label: "Configurações", icon: "settings", items: [
    { label: "Configurações da empresa", href: "/configuracoes", icon: "settings" },
    { label: "Lixeira", href: "/lixeira", icon: "trash-2" },
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
    { label: "Administração", href: "/admin", icon: "shield-check" },
    { label: "Inventário de rotas", href: "/dashboard/administration/routes", icon: "network" },
    { label: "Armazenamento", href: "/dashboard/administration/storage", icon: "database" },
    { label: "Segurança e isolamento", href: "/dashboard/administration/security", icon: "shield-check" },
  ];
  const config: Section = {
    ...configBase,
    items: [...configBase.items, ...(admin ? FERRAMENTAS_DE_PLATAFORMA : [])],
  };
  return { sections: [...base, config], pessoal };
}
