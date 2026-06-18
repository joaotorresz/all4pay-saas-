"use client";

import { Icon } from "@/components/ui";

/**
 * Botão hambúrguer — só aparece em telas < lg. Abre/fecha o drawer da Sidebar
 * via evento global `a4p:toggle-nav` (mesmo padrão do CommandPalette/NovaTransacao).
 */
export function MobileNavButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("a4p:toggle-nav"))}
      aria-label="Abrir menu"
      className="lg:hidden inline-flex items-center justify-center w-10 h-10 -ml-1 rounded-md hover:bg-surface-2 shrink-0"
    >
      <Icon name="menu" size={22} color="var(--color-ink)" />
    </button>
  );
}
