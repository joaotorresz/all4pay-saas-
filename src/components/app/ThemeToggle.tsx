"use client";

import * as React from "react";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/utils";

/** Lê/aplica o tema (claro/escuro) — classe `dark` no <html> + localStorage. */
export function useTheme() {
  const [dark, setDark] = React.useState(false);
  React.useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  const apply = (d: boolean) => {
    setDark(d);
    document.documentElement.classList.toggle("dark", d);
    try { localStorage.setItem("a4p_theme", d ? "dark" : "light"); } catch { /* ignore */ }
  };
  return { dark, toggle: () => apply(!dark), apply };
}

/** Botão de alternância de tema, no estilo dos itens do rodapé da Sidebar. */
export function ThemeToggle({ collapsed }: { collapsed?: boolean }) {
  const { dark, toggle } = useTheme();
  const label = dark ? "Tema claro" : "Tema escuro";
  return (
    <button
      onClick={toggle}
      title={collapsed ? label : undefined}
      aria-label={label}
      className={cn(
        "relative flex items-center rounded-md py-2 text-left bg-transparent hover:bg-surface-1",
        collapsed ? "justify-center px-0" : "gap-[10px] px-[10px]",
      )}
    >
      <Icon name={dark ? "sun" : "moon"} size={17} color="var(--color-text-secondary)" />
      {!collapsed && <span className="text-[14px] font-medium text-muted">{label}</span>}
    </button>
  );
}
