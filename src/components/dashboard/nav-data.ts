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

export type Item = { label: string; href?: string; icon: string; event?: string; soon?: boolean };

/**
 * Um grupo do menu.
 *
 * `href` presente ⇒ o grupo É um destino (folha, sem chevron) — é assim que
 * Início, Orçamento e Ajuda aparecem no mesmo nível dos grupos que abrem.
 */
export type Section = {
  id: string;
  label: string;
  icon?: string;
  href?: string;
  pro?: boolean;
  items: Item[];
};

/* ----------------------------- EMPRESA (PJ) -----------------------------
 * Taxonomia do ERP: Dashboards · Cadastros · DRE & DFC · Orçamento ·
 * Movimentações · Vendas e NFs · Compras · Contabilidade, com Configurações
 * no rodapé. O menu é um ACORDEÃO: o grupo abre e mostra as telas dele.
 *
 * ⚠️ Nenhuma rota foi removida. O que era exclusivo do all4pay (IA, motores,
 * upload, governança) continua aqui — os motores seguem atrás do Modo Pro, que
 * é o que evita que um menu de 60 itens caia de uma vez sobre quem chegou hoje.
 */
export const SECTIONS: Section[] = [
  { id: "inicio", label: "Início", icon: "house", href: "/", items: [] },
  { id: "ia", label: "All 4 Pay AI", icon: "sparkles", href: "/all4pay-ai", items: [] },
  {
    id: "dashboards", label: "Dashboards", icon: "layers", items: [
      // ⚠️ Os cinco painéis curados e o Calendário SAÍRAM (05/08/2026). Cada um
      // respondia uma pergunta que outra tela já responde — e duas telas com o
      // mesmo rótulo produzem dois números, um deles sempre mais velho. Os
      // endereços viraram desvio 308 em `core/rotas/aliases`, então favorito e
      // link compartilhado continuam chegando na tela que responde.
      { label: "Meus dashboards", href: "/dashboard/dashboards/custom", icon: "grip-vertical" },
    ],
  },
  {
    id: "cadastros", label: "Cadastros", icon: "database", items: [
      { label: "Contas bancárias", href: "/dashboard/registrations/bank-accounts", icon: "credit-card" },
      { label: "Plano de contas", href: "/dashboard/registrations/chart-of-accounts", icon: "layers" },
      { label: "Produtos e serviços", href: "/dashboard/registrations/products", icon: "b" },
      { label: "Projetos", href: "/dashboard/registrations/projects", icon: "target" },
      { label: "Centros de custo", href: "/dashboard/registrations/cost-centers", icon: "network" },
      { label: "Clientes", href: "/dashboard/registrations/clients", icon: "users" },
      { label: "Fornecedores", href: "/dashboard/registrations/suppliers", icon: "building" },
      { label: "Contratos", href: "/dashboard/registrations/contracts", icon: "file-text" },
    ],
  },
  {
    id: "dre-dfc", label: "DRE & DFC", icon: "activity", items: [
      { label: "DRE", href: "/dashboard/reports/dre", icon: "trending-up" },
      { label: "DRE multiempresas", href: "/dashboard/reports/dre-multi", icon: "building" },
      { label: "DFC", href: "/dashboard/reports/dfc", icon: "trending-up" },
      { label: "DFC multiempresas", href: "/dashboard/reports/dfc-multi", icon: "building" },
      { label: "Fechamento mensal", href: "/dashboard/reports/monthly-closing", icon: "shield-check" },
    ],
  },
  { id: "orcamento", label: "Planejado × Realizado", icon: "target", href: "/orcamento", items: [] },
  {
    id: "movimentacoes", label: "Movimentações", icon: "building", items: [
      { label: "Títulos a receber", href: "/dashboard/financial/accounts-and-transfers?tab=receivables", icon: "arrow-left-right" },
      { label: "Títulos a pagar", href: "/dashboard/financial/accounts-and-transfers?tab=payables", icon: "arrow-up-right" },
      { label: "Transferências", href: "/dashboard/financial/accounts-and-transfers?tab=transfers", icon: "repeat" },
      { label: "Conciliação bancária", href: "/dashboard/financial/reconciliation", icon: "list-checks" },
      { label: "Fluxo de caixa", href: "/fluxo-caixa", icon: "trending-up" },
      { label: "Extrato", href: "/dashboard/financial/statement", icon: "receipt" },
      { label: "Fatura do cartão", href: "/dashboard/financial/credit-card-invoices", icon: "credit-card" },
    ],
  },
  {
    id: "vendas", label: "Vendas e NFs", icon: "shopping-cart", items: [
      { label: "Vendas", href: "/dashboard/sales-invoices", icon: "shopping-cart" },
      { label: "Assinaturas e contratos", href: "/dashboard/sales-invoices/subscriptions", icon: "repeat" },
      { label: "Notas fiscais", href: "/dashboard/sales-invoices/invoices", icon: "file-text" },
      { label: "Impostos sobre vendas", href: "/dashboard/sales-invoices/tax-provisioning", icon: "receipt" },
      { label: "Links de pagamento", href: "/dashboard/sales-invoices/payment-links", icon: "link" },
    ],
  },
  {
    id: "compras", label: "Compras", icon: "inbox", items: [
      { label: "Compras", href: "/dashboard/purchases", icon: "inbox" },
      { label: "Boletos recebidos", href: "/dashboard/purchases/received-boletos", icon: "file-text" },
      { label: "NFs recebidas", href: "/dashboard/purchases/received-invoices", icon: "receipt" },
    ],
  },
  {
    id: "contabil", label: "Contabilidade", icon: "receipt", items: [
      { label: "Envio das NFs ao contador", href: "/dashboard/accounting/nfe-export", icon: "mail" },
      { label: "Gerar TXT contábil", href: "/dashboard/accounting/dominio-export", icon: "file-text" },
      { label: "Contabilidade", href: "/contabilidade", icon: "layers" },
    ],
  },
  {
    id: "entrada", label: "Entrada de dados", icon: "upload", items: [
      { label: "Upload de dados", href: "/upload", icon: "upload" },
      // Inadimplência é OPERACIONAL (quem me deve), não um recurso pago. Vivia
      // duplicada no grupo Pro, o que a tornava paga num menu e grátis no hub.
      { label: "Inadimplência", href: "/dashboard/financial/overdue", icon: "triangle-alert" },
    ],
  },
  // ----- Profundidade — revelada no Modo Pro -----
  {
    id: "inteligencia", label: "Inteligência", icon: "gauge", pro: true, items: [
      // ⚠️ "Copiloto e motores" (→ /all4pay-ai?aba=quant) SAIU. Era a terceira
      // porta para a MESMA IA: o FAB global, a tela cheia em `/all4pay-ai` e
      // mais este atalho. Três entradas para um só destino é o que faz a pessoa
      // duvidar de que são a mesma coisa — e foi assim que a IA já teve seis.
      // Ficam duas: o FAB em toda tela e a tela cheia para conversa longa.
      { label: "Investor update", href: "/investidores", icon: "mail" },
      { label: "Plano de contratações", href: "/contratacoes", icon: "users" },
    ],
  },
  {
    id: "plataforma", label: "Governança", icon: "shield-check", pro: true, items: [
      { label: "Solicitações & aprovações", href: "/aprovacoes", icon: "list-checks" },
      { label: "Governança e auditoria", href: "/governanca", icon: "shield-check" },
      { label: "Consolidado", href: "/contabilidade?aba=consolidado", icon: "building" },
    ],
  },
  { id: "comece", label: "Comece por aqui", icon: "target", href: "/comece", items: [] },
  { id: "ajuda", label: "Central de ajuda", icon: "help-circle", href: "/dashboard/help", items: [] },
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

  // PF tem a sua árvore; PJ esconde os grupos `pro` no Modo Simples.
  const base = pessoal ? SECTIONS_PESSOAL : SECTIONS.filter((s) => pro || !s.pro);
  const configBase = pessoal ? CONFIG_PESSOAL : CONFIG;
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
