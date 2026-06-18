import * as React from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { PageGuide } from "@/components/app/PageGuide";
import { CommandPalette } from "@/components/app/CommandPalette";
import { VisualEditor } from "@/components/app/VisualEditor";
import { NovaTransacao } from "@/components/lancamentos/NovaTransacao";
import { MobileNavButton } from "@/components/app/MobileNavButton";

/**
 * Standard app frame: route-aware sidebar + scrollable main column with a
 * page header (breadcrumb, title, optional actions). Reused by the
 * financial screens. Responsivo: a Sidebar vira drawer em < lg (hambúrguer no
 * header), e padding/título encolhem no mobile.
 */
export function AppShell({
  title,
  crumb = "all4pay financeiro",
  actions,
  children,
  scopeClassName,
}: {
  title: string;
  crumb?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Classe de escopo aplicada SÓ ao <main> (ex.: teste de DS na Home). */
  scopeClassName?: string;
}) {
  return (
    <div className="fixed inset-0 flex bg-surface-1 overflow-hidden">
      <Sidebar />
      <main className={`flex-1 flex flex-col min-w-0 min-h-0${scopeClassName ? ` ${scopeClassName}` : ""}`}>
        <header className="flex items-end justify-between gap-3 flex-wrap px-4 sm:px-6 lg:px-8 pt-5 lg:pt-[26px] pb-[18px]">
          <div className="flex items-center gap-2 min-w-0">
            <MobileNavButton />
            <div className="min-w-0">
              <div className="text-caption font-medium text-faint mb-1">
                {crumb}
              </div>
              <h1 className="m-0 text-[26px] sm:text-[30px] lg:text-[35px] leading-[1.15] font-semibold tracking-[-0.01em] text-ink truncate">
                {title}
              </h1>
            </div>
          </div>
          {actions && (
            <div className="flex items-center gap-[10px] flex-wrap justify-end">{actions}</div>
          )}
        </header>
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 pb-10">{children}</div>
      </main>
      <PageGuide />
      <CommandPalette />
      <VisualEditor />
      <NovaTransacao />
    </div>
  );
}
