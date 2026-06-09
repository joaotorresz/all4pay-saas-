import * as React from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";

/**
 * Standard app frame: route-aware sidebar + scrollable main column with a
 * page header (breadcrumb, title, optional actions). Reused by the
 * financial screens.
 */
export function AppShell({
  title,
  crumb = "all4pay financeiro",
  actions,
  children,
}: {
  title: string;
  crumb?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen w-screen bg-surface-1 overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 min-h-0">
        <header className="flex items-end justify-between gap-4 px-8 pt-[26px] pb-[18px]">
          <div>
            <div className="text-caption font-medium text-faint mb-1">
              {crumb}
            </div>
            <h1 className="m-0 text-[29px] leading-[1.15] font-semibold tracking-[-0.01em] text-ink">
              {title}
            </h1>
          </div>
          {actions && (
            <div className="flex items-center gap-[10px]">{actions}</div>
          )}
        </header>
        <div className="flex-1 overflow-y-auto px-8 pb-10">{children}</div>
      </main>
    </div>
  );
}
