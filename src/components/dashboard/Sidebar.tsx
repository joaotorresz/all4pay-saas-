"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge, Avatar, Icon } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * all4pay app sidebar — 240px, white. Command bar with a subtle lime
 * tint at top, linear-icon nav with active marker + NEW/count badges,
 * and an account footer.
 *
 * Route-aware: items with an `href` render as links and light up from the
 * current pathname. Items without `href` fall back to the controlled
 * `active` / `onNavigate` mode (used by the Treasury demo screen).
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
  { id: "overview", label: "Visão Geral", icon: "trending-up", href: "/visao-geral" },
  { id: "payments", label: "Pagamentos", icon: "arrow-left-right", badge: "new" },
  { id: "fx", label: "Câmbio", icon: "repeat", badge: "new" },
  { id: "invoices", label: "Faturas", icon: "file-text" },
  { id: "cards", label: "Cartões", icon: "credit-card" },
];

const FOOTER = [
  { label: "Configurações", icon: "settings" },
  { label: "Central de Ajuda", icon: "life-buoy" },
  { label: "Adicionar Empresa", icon: "plus" },
];

export function Sidebar({
  active,
  onNavigate,
}: {
  active?: string;
  onNavigate?: (id: string) => void;
}) {
  const pathname = usePathname();
  return (
    <aside className="w-sidebar shrink-0 h-full bg-white border-r border-border flex flex-col px-3 py-4">
      {/* Brand */}
      <div className="flex items-center gap-[9px] px-2 pb-[14px] pt-1">
        <Image
          src="/all4pay-dark.png"
          alt="all4pay"
          width={110}
          height={22}
          className="h-[22px] w-auto"
          priority
        />
      </div>

      {/* Command bar (⌘K) — the one sanctioned lime tint here */}
      <button className="flex items-center gap-2 w-full bg-lime-tint border border-[#ECF6B8] rounded-md px-[11px] py-[9px] mb-[14px] cursor-pointer">
        <Icon name="search" size={15} color="var(--color-text-secondary)" />
        <span className="text-label text-muted font-regular">Olá, operador…</span>
        <span className="ml-auto text-[11px] font-medium text-faint bg-black/5 rounded-[5px] px-[5px] py-[2px]">
          ⌘K
        </span>
      </button>

      {/* Nav */}
      <nav className="flex flex-col gap-[2px]">
        {NAV.map((n) => {
          const on = n.href
            ? n.href === "/"
              ? pathname === "/"
              : pathname.startsWith(n.href)
            : active === n.id;
          const inner = (
            <>
              {on && (
                <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-[3px] h-[18px] rounded-pill bg-ink" />
              )}
              <Icon
                name={n.icon}
                size={17}
                color={on ? "var(--color-ink)" : "var(--color-text-secondary)"}
              />
              <span
                className={cn(
                  "text-[14px] font-medium",
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
          );
          const cls = cn(
            "relative flex items-center gap-[10px] w-full rounded-md px-[10px] py-2 text-left",
            on ? "bg-surface-2" : "bg-transparent",
          );
          if (n.href) {
            return (
              <Link key={n.id} href={n.href} className={cls}>
                {inner}
              </Link>
            );
          }
          return (
            <button
              key={n.id}
              onClick={() => onNavigate?.(n.id)}
              className={cls}
            >
              {inner}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="mt-auto flex flex-col gap-[2px] pt-[10px] border-t border-border-soft">
        {FOOTER.map((f) => (
          <button
            key={f.label}
            className="relative flex items-center gap-[10px] w-full rounded-md px-[10px] py-2 text-left bg-transparent"
          >
            <Icon name={f.icon} size={17} color="var(--color-text-secondary)" />
            <span className="text-[14px] font-medium text-muted">{f.label}</span>
          </button>
        ))}
        <div className="flex items-center gap-[9px] px-2 pt-2 pb-1 mt-1">
          <Avatar name="Operador Um" size={30} />
          <div className="min-w-0">
            <div className="text-label font-medium text-ink truncate">
              Operador Um
            </div>
            <div className="text-[11px] text-faint">ops@all4pay.co</div>
          </div>
          <Icon
            name="chevrons-up-down"
            size={15}
            color="var(--color-text-tertiary)"
            className="ml-auto"
          />
        </div>
      </div>
    </aside>
  );
}
