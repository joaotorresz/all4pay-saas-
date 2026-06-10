"use client";

import * as React from "react";
import { ReceivablesCard } from "./ReceivablesCard";
import { PayablesCard } from "./PayablesCard";
import { AccountsCard } from "./AccountsCard";
import { DailyCashflowChart } from "./DailyCashflowChart";
import { SalesChart } from "./SalesChart";
import { FirstRunCard } from "./FirstRunCard";
import { HomeCustomizeDrawer, HOME_WIDGET_IDS } from "./HomeCustomizeDrawer";

const KEY = "a4p_home_widgets";

/** The financial overview: widgets isolados, com visibilidade personalizável. */
export function OverviewGrid() {
  const [visiveis, setVisiveis] = React.useState<Record<string, boolean>>({});
  const [drawer, setDrawer] = React.useState(false);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setVisiveis(JSON.parse(raw));
    } catch { /* ignore */ }
    const onOpen = () => setDrawer(true);
    window.addEventListener("a4p:open-personalizar", onOpen);
    return () => window.removeEventListener("a4p:open-personalizar", onOpen);
  }, []);

  const persist = (v: Record<string, boolean>) => {
    setVisiveis(v);
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ }
  };
  const toggle = (id: string) => persist({ ...visiveis, [id]: visiveis[id] === false });
  const reset = () => persist({});
  const on = (id: string) => visiveis[id] !== false; // default: visível

  const algumVisivel = HOME_WIDGET_IDS.some(on);

  return (
    <div className="flex flex-col gap-5">
      <FirstRunCard />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
        {on("receivables") && <ReceivablesCard />}
        {on("payables") && <PayablesCard />}
        {on("accounts") && (
          <div className="md:col-span-2">
            <AccountsCard />
          </div>
        )}
        {on("cashflow") && <DailyCashflowChart />}
        {on("sales") && <SalesChart />}
      </div>

      {!algumVisivel && (
        <p className="text-caption text-faint text-center py-6">
          Nenhum bloco visível. Abra <b className="text-muted font-medium">Personalizar Home</b> no topo para reativar.
        </p>
      )}

      <HomeCustomizeDrawer
        open={drawer}
        visiveis={visiveis}
        onToggle={toggle}
        onReset={reset}
        onClose={() => setDrawer(false)}
      />
    </div>
  );
}
