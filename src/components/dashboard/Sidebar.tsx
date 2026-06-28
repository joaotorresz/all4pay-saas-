"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Avatar, Icon } from "@/components/ui";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { useModo } from "@/components/app/useModo";
import { useTipoConta } from "@/components/app/useTipoConta";
import { isPlatformAdmin } from "@/lib/admin";
import { isDemo } from "@/lib/demo";
import { cn } from "@/lib/utils";

const SUPA_CONFIGURED = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
const STORAGE_KEY = "a4p_sidebar_collapsed";

/**
 * all4pay app sidebar — modelo **Visor**: seções com rótulo em CAIXA-ALTA e
 * itens PLANOS (sem acordeão). Item ativo = fundo `lime-tint` + texto ink + barra
 * lime à esquerda. Sem o widget de saldo (ganha espaço). Recolhível (rail de
 * ícones), drawer no mobile, rodapé com Modo Pro · tema · usuário.
 */
type Item = { label: string; href?: string; icon: string; event?: string; soon?: boolean };
type Section = { id: string; label: string; pro?: boolean; items: Item[] };

/* ----------------------------- EMPRESA (PJ) -----------------------------
 * Estrutura nos 9 módulos do IULI (benchmark): Dashboards · Cadastros · DRE & DFC
 * · Orçamento · Movimentações · Vendas e NFs · Compras · Contabilidade · (extras
 * all4pay em Pro). Rotas mapeadas no app existente. */
const SECTIONS: Section[] = [
  {
    id: "dashboards", label: "Dashboards", items: [
      { label: "Início", href: "/", icon: "house" },
      { label: "Vendas", href: "/vendas", icon: "credit-card" },
      { label: "Financeiro", href: "/fluxo-caixa", icon: "trending-up" },
      { label: "Assinaturas", href: "/recorrencias", icon: "repeat" },
      { label: "Contas a pagar", href: "/pagaveis", icon: "arrow-up-right" },
      { label: "Contas a receber", href: "/recebiveis", icon: "arrow-left-right" },
    ],
  },
  {
    id: "cadastros", label: "Cadastros", items: [
      { label: "Plano de Contas", href: "/plano-de-contas", icon: "layers" },
      { label: "Produtos", href: "/produtos", icon: "shopping-cart" },
      { label: "Serviços", href: "/servicos", icon: "receipt" },
      { label: "Clientes & Fornecedores", href: "/contatos", icon: "users" },
      { label: "Contas bancárias", href: "/upload?aba=conectar", icon: "upload" },
      { label: "Contratos", href: "/recorrencias", icon: "file-text" },
    ],
  },
  {
    id: "dre-dfc", label: "DRE & DFC", items: [
      { label: "DRE", href: "/dre", icon: "trending-up" },
      { label: "DFC · Fluxo de caixa", href: "/fluxo-caixa", icon: "trending-up" },
      { label: "Fechamento mensal", href: "/fechamento", icon: "check" },
    ],
  },
  {
    id: "orcamento", label: "Orçamento", items: [
      { label: "Orçamento", href: "/orcamento", icon: "target" },
    ],
  },
  {
    id: "movimentacoes", label: "Movimentações", items: [
      { label: "Contas a receber", href: "/recebimentos", icon: "arrow-left-right" },
      { label: "Contas a pagar", href: "/pagamentos", icon: "arrow-up-right" },
      { label: "Conciliação", href: "/upload?aba=conciliar", icon: "list-checks" },
      { label: "Extrato · Razão", href: "/razao", icon: "receipt" },
    ],
  },
  {
    id: "vendas-nfs", label: "Vendas e NFs", items: [
      { label: "Vendas", href: "/vendas", icon: "credit-card" },
      { label: "Assinaturas", href: "/recorrencias", icon: "repeat" },
      { label: "Notas fiscais", href: "/notas-fiscais", icon: "file-text" },
      { label: "Inadimplência", href: "/inadimplencia", icon: "triangle-alert" },
      { label: "Boletos", href: "/boletos", icon: "file-text" },
    ],
  },
  {
    id: "compras", label: "Compras", items: [
      { label: "Reembolsos", href: "/reembolsos", icon: "arrow-up-right" },
      { label: "Boletos recebidos", soon: true, icon: "file-text" },
      { label: "NFs recebidas", soon: true, icon: "receipt" },
    ],
  },
  {
    id: "contabilidade", label: "Contabilidade", items: [
      { label: "Relatórios", href: "/relatorios", icon: "receipt" },
      { label: "Dimensões & Tags", href: "/dimensoes", icon: "layers" },
      { label: "Cronogramas", href: "/cronogramas", icon: "calendar" },
      { label: "Consolidado (multiempresa)", href: "/consolidado", icon: "building" },
    ],
  },
  // ----- Extras all4pay (escondidos no Modo Simples) -----
  {
    id: "estrategia", label: "Inteligência", pro: true, items: [
      { label: "All4Pay IA", href: "/copiloto?aba=copiloto", icon: "sparkles" },
      { label: "Decisão", href: "/copiloto?aba=decisao", icon: "gauge" },
      { label: "Operação autônoma", href: "/copiloto?aba=autonomo", icon: "workflow" },
      { label: "Risco de caixa", href: "/copiloto?aba=risco", icon: "activity" },
      { label: "Inteligência (quant)", href: "/copiloto?aba=quant", icon: "trending-up" },
      { label: "Dados (moat)", href: "/copiloto?aba=dados", icon: "database" },
    ],
  },
  {
    id: "equipe", label: "Equipe", pro: true, items: [
      { label: "Solicitações & aprovações", href: "/aprovacoes", icon: "list-checks" },
      { label: "Governança & Auditoria", href: "/governanca", icon: "shield-check" },
    ],
  },
  {
    id: "plataforma", label: "Plataforma", pro: true, items: [
      { label: "Orquestração", href: "/orquestracao", icon: "network" },
      { label: "Infraestrutura", href: "/infraestrutura", icon: "cpu" },
      { label: "Arquitetura", href: "/arquitetura", icon: "layers" },
      { label: "Automações", href: "/automacoes", icon: "workflow" },
    ],
  },
];
const CONFIG: Section = {
  id: "config", label: "Configurações", items: [
    { label: "Empresa", href: "/configuracoes", icon: "settings" },
    { label: "Lixeira", href: "/lixeira", icon: "trash-2" },
    { label: "Adicionar Empresa", href: "/comecar", icon: "plus" },
  ],
};

/* ----------------------------- PESSOA FÍSICA (PF) ----------------------------- */
const SECTIONS_PESSOAL: Section[] = [
  {
    id: "gastos", label: "Meu dia a dia", items: [
      { label: "Resumo", href: "/", icon: "house" },
      { label: "Meus gastos", href: "/pagamentos", icon: "arrow-up-right" },
      { label: "Minhas receitas", href: "/recebimentos", icon: "arrow-left-right" },
      { label: "Assinaturas / recorrentes", href: "/recorrencias", icon: "repeat" },
    ],
  },
  {
    id: "contas", label: "Contas & carteiras", items: [
      { label: "Conectar banco (Open finance)", href: "/upload?aba=conectar", icon: "upload" },
      { label: "Importar extrato", href: "/upload?aba=enviar", icon: "upload" },
      { label: "Conciliar", href: "/upload?aba=conciliar", icon: "list-checks" },
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
const CONFIG_PESSOAL: Section = {
  id: "config", label: "Configurações", items: [
    { label: "Meu perfil", href: "/configuracoes", icon: "settings" },
    { label: "Lixeira", href: "/lixeira", icon: "trash-2" },
  ],
};

function leafAtivo(href: string | undefined, pathname: string): boolean {
  if (!href) return false;
  if (href === "/") return pathname === "/";
  const base = href.split("?")[0];
  return pathname === base || pathname.startsWith(base + "/");
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [isDesktop, setIsDesktop] = React.useState(true);
  const [usuario, setUsuario] = React.useState<{ nome: string; email: string } | null>(null);

  React.useEffect(() => { setCollapsed(localStorage.getItem(STORAGE_KEY) === "1"); }, []);

  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  React.useEffect(() => {
    const toggle = () => setMobileOpen((o) => !o);
    window.addEventListener("a4p:toggle-nav", toggle);
    return () => window.removeEventListener("a4p:toggle-nav", toggle);
  }, []);

  React.useEffect(() => { setMobileOpen(false); }, [pathname]);

  React.useEffect(() => {
    if (isDemo || !SUPA_CONFIGURED) return;
    let ativo = true;
    import("@/lib/supabase/client").then(async ({ createClient }) => {
      const { data } = await createClient().auth.getUser();
      if (!ativo || !data.user) return;
      const email = data.user.email ?? "";
      const meta = data.user.user_metadata as { name?: string; full_name?: string } | undefined;
      const nome = meta?.name || meta?.full_name || (email ? email.split("@")[0] : "Usuário");
      setUsuario({ nome, email });
    });
    return () => { ativo = false; };
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };

  const col = collapsed && isDesktop;

  const { pro, set: setPro } = useModo();
  const { pessoal } = useTipoConta();
  const [admin, setAdmin] = React.useState(false);
  React.useEffect(() => { isPlatformAdmin().then(setAdmin).catch(() => setAdmin(false)); }, []);

  // Seções visíveis: PF tem a sua; PJ esconde as `pro` no Modo Simples.
  const baseSections = pessoal ? SECTIONS_PESSOAL : SECTIONS.filter((s) => pro || !s.pro);
  const configBase = pessoal ? CONFIG_PESSOAL : CONFIG;
  const configSection: Section = {
    ...configBase,
    items: [...configBase.items, ...(admin ? [{ label: "Administração", href: "/admin", icon: "shield-check" } as Item] : [])],
  };
  const allSections = [...baseSections, configSection];

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}
      <aside
        className={cn(
          "a4p-sidebar h-full bg-white border-r border-border flex flex-col py-4 z-50",
          "fixed inset-y-0 left-0 w-sidebar px-3 transition-transform duration-200 ease-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "lg:static lg:translate-x-0 lg:shrink-0 lg:transition-[width]",
          col ? "lg:w-[68px] lg:px-2" : "lg:w-sidebar lg:px-3",
        )}
      >
        {/* Marca + recolher */}
        <div className={cn("flex items-center pb-[18px] pt-1", col ? "justify-center" : "gap-[9px] px-2")}>
          {!col && (
            <>
              <Image src="/all4pay-dark.png" alt="all4pay" width={110} height={22} className="h-[22px] w-auto dark:hidden" priority />
              <Image src="/all4pay-lime.png" alt="all4pay" width={110} height={22} className="h-[22px] w-auto hidden dark:block" priority />
            </>
          )}
          <button
            onClick={toggleCollapsed}
            aria-label={col ? "Expandir menu" : "Recolher menu"}
            title={col ? "Expandir menu" : "Recolher menu"}
            className={cn("hidden lg:inline-flex items-center justify-center rounded-md hover:bg-surface-2 p-[6px]", col ? "" : "ml-auto")}
          >
            <Icon name={col ? "chevron-right" : "chevron-left"} size={17} color="var(--color-text-secondary)" />
          </button>
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar menu"
            className="lg:hidden inline-flex items-center justify-center rounded-md hover:bg-surface-2 p-[6px] ml-auto"
          >
            <Icon name="x" size={18} color="var(--color-text-secondary)" />
          </button>
        </div>

        {/* Nav — seções planas (modelo Visor) */}
        <nav className="flex flex-col flex-1 min-h-0 overflow-y-auto overflow-x-hidden -mr-1 pr-1">
          {allSections.map((s, si) => (
            <div key={s.id} className={cn("flex flex-col gap-[2px]", col ? "mt-2 first:mt-0" : "mt-3 first:mt-0", si === allSections.length - 1 && !col ? "pt-2 mt-3 border-t border-border-soft" : "")}>
              {!col && (
                <span className="px-[10px] pt-[2px] pb-[3px] text-[12px] font-semibold text-faint truncate">{s.label}</span>
              )}
              {s.items.map((it, i) => (
                <NavItem key={it.href ?? it.label + i} item={it} pathname={pathname} collapsed={col} />
              ))}
            </div>
          ))}
        </nav>

        {/* Rodapé: Modo Pro · tema · usuário */}
        <div className="shrink-0 flex flex-col gap-[2px] pt-[10px] mt-[10px] border-t border-border-soft">
          {!pessoal && (
            <button
              onClick={() => setPro(pro ? "simples" : "pro")}
              title={pro ? "Modo Pro (motores e Plataforma visíveis)" : "Modo Simples (essencial)"}
              className={cn("relative flex items-center rounded-md py-2 hover:bg-surface-1", col ? "justify-center px-0" : "gap-[10px] px-[10px]")}
            >
              <Icon name="sparkles" size={18} color={pro ? "var(--color-ink)" : "var(--color-text-secondary)"} />
              {!col && (
                <>
                  <span className={cn("text-[15px] font-medium", pro ? "text-ink" : "text-muted")}>Modo Pro</span>
                  <span className={cn("ml-auto w-[34px] h-[20px] rounded-pill p-[2px] transition-colors", pro ? "bg-lime" : "bg-surface-3")}>
                    <span className={cn("block w-[16px] h-[16px] rounded-pill bg-white transition-transform", pro && "translate-x-[14px]")} />
                  </span>
                </>
              )}
            </button>
          )}
          <ThemeToggle collapsed={col} />
          <div className={cn("flex items-center pt-2 pb-1 mt-1", col ? "justify-center" : "gap-[9px] px-2")}>
            <Avatar name={isDemo ? "Demonstração" : (usuario?.nome ?? "all4pay")} size={30} />
            {!col && (
              <>
                <div className="min-w-0">
                  <div className="text-label font-medium text-ink truncate">{isDemo ? "Demonstração" : (usuario?.nome ?? "Conta")}</div>
                  <div className="text-[13px] text-faint truncate">{isDemo ? "modo demonstração" : (usuario?.email ?? "")}</div>
                </div>
                {SUPA_CONFIGURED ? (
                  <button
                    onClick={async () => {
                      const { createClient } = await import("@/lib/supabase/client");
                      await createClient().auth.signOut();
                      router.push("/login");
                      router.refresh();
                    }}
                    aria-label="Sair"
                    className="ml-auto inline-flex p-1 rounded-md hover:bg-surface-2"
                    title="Sair"
                  >
                    <Icon name="arrow-up-right" size={15} color="var(--color-text-tertiary)" />
                  </button>
                ) : (
                  <Icon name="chevrons-up-down" size={15} color="var(--color-text-tertiary)" className="ml-auto" />
                )}
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

/** Item de nav plano (modelo Visor). Ativo = fundo lime-tint + barra lime + ink. */
function NavItem({ item, pathname, collapsed }: { item: Item; pathname: string; collapsed: boolean }) {
  // Ação por evento (ex.: abrir modal).
  if (item.event && !item.href) {
    return (
      <button
        onClick={() => window.dispatchEvent(new Event(item.event!))}
        title={item.label}
        className={cn("relative flex items-center rounded-md py-2 hover:bg-surface-1", collapsed ? "justify-center px-0" : "gap-[10px] px-[10px]")}
      >
        <Icon name={item.icon} size={18} color="var(--color-lime)" />
        {!collapsed && <span className="text-[15px] font-medium text-ink truncate">{item.label}</span>}
      </button>
    );
  }
  if (item.soon || !item.href) {
    if (collapsed) return null;
    return (
      <span aria-disabled="true" className="relative flex items-center gap-[10px] px-[10px] rounded-md py-2 opacity-45 cursor-not-allowed select-none">
        <Icon name={item.icon} size={18} color="var(--color-text-secondary)" />
        <span className="text-[15px] text-muted truncate flex-1">{item.label}</span>
        <span className="text-[11px] text-faint bg-surface-2 rounded-pill px-[6px] py-[1px] shrink-0">Em breve</span>
      </span>
    );
  }
  const on = leafAtivo(item.href, pathname);
  return (
    <Link
      href={item.href}
      title={item.label}
      aria-current={on ? "page" : undefined}
      className={cn(
        "relative flex items-center rounded-md py-2",
        collapsed ? "justify-center px-0" : "gap-[10px] px-[10px]",
        on ? "bg-lime-tint" : "hover:bg-surface-1",
      )}
    >
      {on && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[18px] rounded-pill bg-lime" />}
      <Icon name={item.icon} size={18} color={on ? "var(--color-ink)" : "var(--color-text-secondary)"} />
      {!collapsed && <span className={cn("text-[15px] truncate", on ? "text-ink font-semibold" : "text-muted font-medium")}>{item.label}</span>}
    </Link>
  );
}
