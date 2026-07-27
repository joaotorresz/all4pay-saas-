"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Avatar, Icon } from "@/components/ui";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { useModo } from "@/components/app/useModo";
import { leafAtivo, useNavSections, type Item } from "@/components/dashboard/nav-data";
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
  // Grupos/itens vêm do módulo único de navegação (`dashboard/nav-data`), que
  // já resolve PF/PJ · Simples/Pro · super-admin.
  const { sections: allSections, pessoal } = useNavSections();

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

        {/* Busca — dispara a MESMA command palette do ⌘K. Fica aqui porque a
            barra do topo saiu; sem isto a busca só existiria pelo atalho. */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("a4p:open-search"))}
          aria-label="Buscar no sistema"
          title="Buscar no sistema"
          className={cn(
            "flex items-center h-9 mb-2 rounded-pill bg-surface-2 hover:bg-surface-3 transition-colors",
            col ? "justify-center w-9 mx-auto px-0" : "gap-2 px-3",
          )}
        >
          <Icon name="search" size={16} color="var(--color-text-secondary)" />
          {!col && (
            <>
              <span className="text-[14px] text-muted truncate">Buscar…</span>
              <kbd className="ml-auto text-[11px] font-medium text-faint tabular-nums">⌘K</kbd>
            </>
          )}
        </button>

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
              title={pro ? "Modo Pro ativo — some para o essencial (Simples)" : "Modo Pro — desbloqueia Fiscal, Contabilidade, Inteligência e Plataforma"}
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
        // Nav ativo CLEAN: pill branco discreto + texto/ícone ink + marcador LIMA
        // fino à esquerda (lima como tempero, nunca preenchimento). Raio 12px.
        "relative flex items-center rounded-[12px] py-2 transition-colors",
        collapsed ? "justify-center px-0" : "gap-[10px] px-[10px]",
        on ? "bg-white" : "hover:bg-surface-2",
      )}
    >
      {on && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-[16px] w-[3px] rounded-pill bg-lime" aria-hidden />}
      <Icon name={item.icon} size={18} color={on ? "var(--color-ink)" : "var(--color-text-secondary)"} />
      {!collapsed && <span className={cn("text-[15px] truncate", on ? "text-ink font-semibold" : "text-muted font-medium")}>{item.label}</span>}
    </Link>
  );
}
