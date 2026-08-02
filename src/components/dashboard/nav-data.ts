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
export type Section = { id: string; label: string; pro?: boolean; items: Item[] };

/* ----------------------------- EMPRESA (PJ) -----------------------------
 * Reorganizado por JOB do usuário (não pela taxonomia contábil), para
 * ADESÃO PROGRESSIVA: o Modo Simples (padrão) mostra só o dia a dia —
 * Início · Receber · Pagar · Caixa & Resultado · Dados & Cadastros
 * (5 grupos, ~15 itens). O Modo Pro REVELA a profundidade — Fiscal &
 * vendas · Contabilidade · Estrutura · Inteligência · Governança &
 * Plataforma. Toda rota do sistema continua acessível (nada removido,
 * só reagrupado/priorizado). O usuário cresce do essencial ao 100%. */
export const SECTIONS: Section[] = [
  {
    id: "inicio", label: "Início", items: [
      { label: "Início", href: "/", icon: "inicio" },
      // A IA também vive no FAB flutuante (em toda tela); aqui é a tela CHEIA,
      // com histórico de conversas. Mesmo motor, layouts diferentes.
      { label: "All 4 Pay AI", href: "/all4pay-ai", icon: "sparkles" },
      // A Home é curada por nós; aqui a pessoa monta a DELA, com os widgets
      // e as fontes que quiser.
      { label: "Meus dashboards", href: "/dashboard/dashboards/custom", icon: "layers" },
      { label: "Comece por aqui", href: "/comece", icon: "target" },
    ],
  },
  {
    id: "receber", label: "Receber", items: [
      { label: "Receber", href: "/recebimentos", icon: "arrow-left-right" },
      { label: "Vendas e NFs", href: "/vendas", icon: "credit-card" },
    ],
  },
  {
    id: "pagar", label: "Pagar", items: [
      { label: "Pagar", href: "/pagamentos", icon: "arrow-up-right" },
    ],
  },
  {
    id: "caixa", label: "Caixa & Resultado", items: [
      { label: "Fluxo de caixa", href: "/fluxo-caixa", icon: "trending-up" },
      { label: "DRE (resultado)", href: "/dre", icon: "trending-up" },
      { label: "Orçamento", href: "/orcamento", icon: "target" },
    ],
  },
  {
    id: "dados", label: "Dados & Cadastros", items: [
      { label: "Upload de dados", href: "/upload", icon: "upload" },
      { label: "Cadastros", href: "/cadastros", icon: "users" },
    ],
  },
  // ----- Profundidade — revelada no Modo Pro -----
  {
    id: "fiscal", label: "Fiscal", pro: true, items: [
      { label: "Impostos", href: "/impostos", icon: "receipt" },
    ],
  },
  {
    id: "contabilidade", label: "Contabilidade", pro: true, items: [
      { label: "Contabilidade", href: "/contabilidade", icon: "receipt" },
    ],
  },
  {
    // Um cérebro, não cinco: Copiloto + Quant/Decisão/Risco/Autônomo/Dados são
    // ABAS internas de /copiloto — o menu tem uma única entrada.
    id: "estrategia", label: "Inteligência", pro: true, items: [
      { label: "All4Pay IA", href: "/copiloto", icon: "gauge" },
      { label: "Investor update", href: "/investidores", icon: "mail" },
      { label: "Plano de contratações", href: "/contratacoes", icon: "users" },
    ],
  },
  {
    // Arquitetura/Infra/Orquestração viraram abas de /plataforma (um hub só).
    id: "plataforma", label: "Governança & Plataforma", pro: true, items: [
      { label: "Solicitações & aprovações", href: "/aprovacoes", icon: "list-checks" },
      { label: "Governança & Auditoria", href: "/governanca", icon: "shield-check" },
      { label: "Automações", href: "/automacoes", icon: "workflow" },
    ],
  },
];

export const CONFIG: Section = {
  id: "config", label: "Configurações", items: [
    { label: "Empresa", href: "/configuracoes", icon: "settings" },
    { label: "Lixeira", href: "/lixeira", icon: "trash-2" },
    { label: "Adicionar Empresa", href: "/empresas/nova", icon: "plus" },
  ],
};

/* ----------------------------- PESSOA FÍSICA (PF) ----------------------------- */
export const SECTIONS_PESSOAL: Section[] = [
  {
    id: "gastos", label: "Meu dia a dia", items: [
      { label: "Resumo", href: "/", icon: "inicio" },
      { label: "Meus gastos", href: "/pagamentos", icon: "arrow-up-right" },
      { label: "Minhas receitas", href: "/recebimentos", icon: "arrow-left-right" },
      { label: "Assinaturas / recorrentes", href: "/recorrencias", icon: "repeat" },
    ],
  },
  {
    id: "contas", label: "Contas & carteiras", items: [
      { label: "Conectar & importar (Open finance)", href: "/upload", icon: "upload" },
    ],
  },
  {
    id: "orcamento", label: "Orçamento & metas", items: [
      { label: "Orçamento mensal", href: "/orcamento", icon: "target" },
      { label: "Para onde foi meu dinheiro", href: "/dre", icon: "trending-up" },
      { label: "Fluxo de caixa", href: "/fluxo-caixa", icon: "trending-up" },
    ],
  },
];

export const CONFIG_PESSOAL: Section = {
  id: "config", label: "Configurações", items: [
    { label: "Meu perfil", href: "/configuracoes", icon: "settings" },
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
  const config: Section = {
    ...configBase,
    items: [...configBase.items, ...(admin ? [{ label: "Administração", href: "/admin", icon: "shield-check" } as Item] : [])],
  };
  return { sections: [...base, config], pessoal };
}
