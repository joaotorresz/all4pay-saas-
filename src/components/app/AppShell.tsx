import * as React from "react";
import { PageGuide } from "@/components/app/PageGuide";
import { CommandPalette } from "@/components/app/CommandPalette";
import { AssistantWidget } from "@/components/app/AssistantWidget";
import { ContatoDrawer } from "@/components/app/ContatoDrawer";
import { NovaTransacao } from "@/components/lancamentos/NovaTransacao";
import { RouteTracker } from "@/components/app/RouteTracker";
import { DesignLab, DesignLabStyle } from "@/components/app/DesignLab";
import { MobileNavButton } from "@/components/app/MobileNavButton";
import { Sidebar } from "@/components/dashboard/Sidebar";

/**
 * Standard app frame: route-aware sidebar + scrollable main column with a
 * page header (breadcrumb, title, optional actions). Reused by the
 * financial screens. Responsivo: a Sidebar vira drawer em < lg (hambúrguer no
 * header), e padding/título encolhem no mobile.
 */
export function AppShell({
  title,
  actions,
  children,
  scopeClassName = "ds-visor",
  stickyHeader = true,
}: {
  title: React.ReactNode;
  /** Aceito por compatibilidade, mas não exibido (breadcrumb removido do header). */
  crumb?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Classe de escopo aplicada SÓ ao <main> (ex.: teste de DS na Home). */
  scopeClassName?: string;
  /** Header fixo no topo (padrão). `false` → rola junto com o conteúdo. */
  stickyHeader?: boolean;
}) {
  const header = (
    <header className="flex items-end justify-between gap-3 flex-wrap px-4 sm:px-6 lg:px-8 pt-5 lg:pt-[26px] pb-[18px]">
      <div className="flex items-center gap-3 min-w-0">
        <MobileNavButton />
        <div className="min-w-0">
          {/* Título da página (Laboratório): Roobert Variable 29/500, tracking
              −0.02em, entrelinha 110%, sem caixa-alta. Vale para TODAS as telas —
              é o mesmo componente; o Lab só conseguia selecionar o da Home. */}
          <h1
            className="m-0 text-[29px] text-ink truncate"
            style={{ fontFamily: '"Roobert Variable", "Roobert", sans-serif', fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.1, textTransform: "none" }}
          >
            {title}
          </h1>
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-[10px] flex-wrap justify-end">{actions}</div>
      )}
    </header>
  );
  return (
    <div className="a4p-canvas fixed inset-0 flex bg-surface-1 overflow-hidden">
      <Sidebar />
      <main className={`flex-1 flex flex-col min-w-0 min-h-0${scopeClassName ? ` ${scopeClassName}` : ""}`}>
        {stickyHeader && header}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 pb-10">
          {/* Header rola junto com o conteúdo quando stickyHeader=false. */}
          {!stickyHeader && <div className="-mx-4 sm:-mx-6 lg:-mx-8">{header}</div>}
          {children}
        </div>
      </main>
      <RouteTracker />
      <DesignLabStyle />
      <DesignLab />
      <PageGuide />
      <CommandPalette />
      <AssistantWidget />
      <ContatoDrawer />
      <NovaTransacao />
    </div>
  );
}
