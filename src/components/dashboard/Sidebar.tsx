"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Badge, Avatar, Icon } from "@/components/ui";
import { cn } from "@/lib/utils";

const SUPA_CONFIGURED = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
const STORAGE_KEY = "a4p_sidebar_collapsed";

/**
 * all4pay app sidebar — white, route-aware. Command bar with a subtle lime
 * tint, linear-icon nav with active marker + NEW/count badges, account footer.
 *
 * Two affordances:
 *  • the nav list scrolls independently (brand/command bar fixed on top,
 *    account footer pinned at the bottom) when items overflow the viewport;
 *  • a collapse toggle shrinks the rail to icons-only (persisted in
 *    localStorage), and the main column expands automatically (AppShell flex-1).
 */
type NavItem = {
  id: string;
  label: string;
  icon: string;
  href?: string;
  badge?: "new";
  count?: string;
};

const NAV: NavItem[] = [
  { id: "home", label: "Início", icon: "house", href: "/" },
  { id: "import", label: "Onboarding inteligente", icon: "upload", href: "/import", badge: "new" },
  { id: "copiloto", label: "Copiloto", icon: "sparkles", href: "/copiloto", badge: "new" },
  { id: "dre", label: "DRE", icon: "receipt", href: "/dre", badge: "new" },
  { id: "inteligencia", label: "Inteligência", icon: "activity", href: "/inteligencia", badge: "new" },
  { id: "decisao", label: "Decisão", icon: "target", href: "/decisao", badge: "new" },
  { id: "autonomo", label: "Autônomo", icon: "cpu", href: "/autonomo", badge: "new" },
  { id: "risco", label: "Risco de caixa", icon: "trending-up", href: "/risco", badge: "new" },
  { id: "inadimplencia", label: "Inadimplência", icon: "gauge", href: "/inadimplencia", badge: "new" },
  { id: "orquestracao", label: "Orquestração", icon: "network", href: "/orquestracao", badge: "new" },
  { id: "infraestrutura", label: "Infraestrutura", icon: "layers", href: "/infraestrutura", badge: "new" },
  { id: "arquitetura", label: "Arquitetura", icon: "building", href: "/arquitetura", badge: "new" },
  { id: "dados", label: "Inteligência de dados", icon: "database", href: "/dados", badge: "new" },
  { id: "governanca", label: "Governança", icon: "shield-check", href: "/governanca", badge: "new" },
  { id: "conciliacao", label: "Conciliação", icon: "list-checks", href: "/conciliacao", badge: "new" },
  { id: "automacoes", label: "Automações", icon: "workflow", href: "/automacoes", badge: "new" },
  { id: "vendas", label: "Vendas", icon: "arrow-left-right", href: "/vendas" },
  { id: "produtos", label: "Produtos", icon: "credit-card", href: "/produtos" },
  { id: "servicos", label: "Serviços", icon: "repeat", href: "/servicos" },
  { id: "contatos", label: "Contatos", icon: "file-text", href: "/contatos" },
];

const FOOTER: { label: string; icon: string; href?: string }[] = [
  { label: "Configurações", icon: "settings", href: "/configuracoes" },
  { label: "Central de Ajuda", icon: "life-buoy" },
  { label: "Adicionar Empresa", icon: "plus", href: "/comecar" },
];

export function Sidebar({
  active,
  onNavigate,
}: {
  active?: string;
  onNavigate?: (id: string) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = React.useState(false);

  // Restaura a preferência (após montar — evita mismatch de hidratação).
  React.useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);
  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <aside
      className={cn(
        "shrink-0 h-full bg-white border-r border-border flex flex-col py-4 transition-[width] duration-200 ease-out",
        collapsed ? "w-[68px] px-2" : "w-sidebar px-3",
      )}
    >
      {/* Brand + toggle */}
      <div className={cn("flex items-center pb-[14px] pt-1", collapsed ? "justify-center" : "gap-[9px] px-2")}>
        {!collapsed && (
          <Image
            src="/all4pay-dark.png"
            alt="all4pay"
            width={110}
            height={22}
            className="h-[22px] w-auto"
            priority
          />
        )}
        <button
          onClick={toggle}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          className={cn(
            "inline-flex items-center justify-center rounded-md hover:bg-surface-2 p-[6px]",
            collapsed ? "" : "ml-auto",
          )}
        >
          <Icon name={collapsed ? "chevron-right" : "chevron-left"} size={17} color="var(--color-text-secondary)" />
        </button>
      </div>

      {/* Command bar (⌘K) — the one sanctioned lime tint here */}
      <button
        className={cn(
          "flex items-center bg-lime-tint border border-[#ECF6B8] rounded-md mb-[14px] cursor-pointer",
          collapsed ? "justify-center py-[9px]" : "gap-2 px-[11px] py-[9px]",
        )}
        title="Buscar (⌘K)"
      >
        <Icon name="search" size={15} color="var(--color-text-secondary)" />
        {!collapsed && (
          <>
            <span className="text-label text-muted font-regular">Olá, operador…</span>
            <span className="ml-auto text-[11px] font-medium text-faint bg-black/5 rounded-[5px] px-[5px] py-[2px]">
              ⌘K
            </span>
          </>
        )}
      </button>

      {/* Nav — scrolls independently when it overflows */}
      <nav className="flex flex-col gap-[2px] flex-1 min-h-0 overflow-y-auto overflow-x-hidden -mr-1 pr-1">
        {NAV.map((n) => {
          const on = n.href
            ? n.href === "/"
              ? pathname === "/"
              : pathname.startsWith(n.href)
            : active === n.id;
          const inner = (
            <>
              {on && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[18px] rounded-pill bg-ink" />
              )}
              <Icon
                name={n.icon}
                size={17}
                color={on ? "var(--color-ink)" : "var(--color-text-secondary)"}
              />
              {!collapsed && (
                <>
                  <span
                    className={cn(
                      "text-[14px] font-medium truncate",
                      on ? "text-ink" : "text-muted",
                    )}
                  >
                    {n.label}
                  </span>
                  {n.badge === "new" && (
                    <Badge variant="new" className="ml-auto">
                      Novo
                    </Badge>
                  )}
                  {n.count != null && (
                    <Badge variant="count" className="ml-auto">
                      {n.count}
                    </Badge>
                  )}
                </>
              )}
            </>
          );
          const cls = cn(
            "relative flex items-center rounded-md py-2 text-left shrink-0",
            collapsed ? "justify-center px-0" : "gap-[10px] px-[10px]",
            on ? "bg-surface-2" : "bg-transparent hover:bg-surface-1",
          );
          if (n.href) {
            return (
              <Link key={n.id} href={n.href} className={cls} title={collapsed ? n.label : undefined}>
                {inner}
              </Link>
            );
          }
          return (
            <button
              key={n.id}
              onClick={() => onNavigate?.(n.id)}
              className={cls}
              title={collapsed ? n.label : undefined}
            >
              {inner}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="shrink-0 flex flex-col gap-[2px] pt-[10px] mt-[10px] border-t border-border-soft">
        {FOOTER.map((f) => {
          const cls = cn(
            "relative flex items-center rounded-md py-2 text-left bg-transparent hover:bg-surface-1",
            collapsed ? "justify-center px-0" : "gap-[10px] px-[10px]",
          );
          const inner = (
            <>
              <Icon name={f.icon} size={17} color="var(--color-text-secondary)" />
              {!collapsed && <span className="text-[14px] font-medium text-muted">{f.label}</span>}
            </>
          );
          return f.href ? (
            <Link key={f.label} href={f.href} title={collapsed ? f.label : undefined} className={cls}>
              {inner}
            </Link>
          ) : (
            <button key={f.label} title={collapsed ? f.label : undefined} className={cls}>
              {inner}
            </button>
          );
        })}
        <div className={cn("flex items-center pt-2 pb-1 mt-1", collapsed ? "justify-center" : "gap-[9px] px-2")}>
          <Avatar name="Operador Um" size={30} />
          {!collapsed && (
            <>
              <div className="min-w-0">
                <div className="text-label font-medium text-ink truncate">
                  Operador Um
                </div>
                <div className="text-[11px] text-faint">ops@all4pay.co</div>
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
                <Icon
                  name="chevrons-up-down"
                  size={15}
                  color="var(--color-text-tertiary)"
                  className="ml-auto"
                />
              )}
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
