"use client";

import * as React from "react";
import { ReceivablesCard } from "./ReceivablesCard";
import { PayablesCard } from "./PayablesCard";
import { AccountsCard } from "./AccountsCard";
import { DailyCashflowChart } from "./DailyCashflowChart";
import { SalesChart } from "./SalesChart";
import { FirstRunCard } from "./FirstRunCard";
import { HomeCustomizeDrawer, HOME_WIDGETS, HOME_WIDGET_IDS } from "./HomeCustomizeDrawer";
import { useHomeContext } from "./homeContext";
import { Icon } from "@/components/ui";
import {
  SaudeFinanceiraCard,
  IAInsightsCard,
  AnomaliasCard,
  TopClientesCard,
  MaioresCategoriasCard,
  UltimosGastosCard,
  PendenciasCard,
} from "./HomeCards";

const KEY_VIS = "a4p_home_widgets";
const KEY_ORD = "a4p_home_order";
const KEY_AUTO = "a4p_home_auto";

/** id → componente do card + se ocupa a linha inteira. */
const CARD: Record<string, { node: React.ReactNode; full?: boolean }> = {
  saude: { node: <SaudeFinanceiraCard />, full: true },
  cashflow: { node: <DailyCashflowChart />, full: true },
  accounts: { node: <AccountsCard />, full: true },
  receivables: { node: <ReceivablesCard /> },
  payables: { node: <PayablesCard /> },
  pendencias: { node: <PendenciasCard /> },
  sales: { node: <SalesChart />, full: true },
  topClientes: { node: <TopClientesCard /> },
  maioresCategorias: { node: <MaioresCategoriasCard /> },
  ultimosGastos: { node: <UltimosGastosCard /> },
  iaInsights: { node: <IAInsightsCard /> },
  anomalias: { node: <AnomaliasCard /> },
};
const GRUPO_DE = new Map(HOME_WIDGETS.map((w) => [w.id, w.grupo]));

export function OverviewGrid() {
  const [visiveis, setVisiveis] = React.useState<Record<string, boolean>>({});
  const [ordem, setOrdem] = React.useState<string[]>(HOME_WIDGET_IDS);
  const [auto, setAuto] = React.useState(true);
  const [drawer, setDrawer] = React.useState(false);
  const hc = useHomeContext(auto);

  React.useEffect(() => {
    try {
      const v = localStorage.getItem(KEY_VIS);
      if (v) setVisiveis(JSON.parse(v));
      const a = localStorage.getItem(KEY_AUTO);
      if (a != null) setAuto(a === "1");
      const o = localStorage.getItem(KEY_ORD);
      if (o) {
        const saved = JSON.parse(o) as string[];
        // Mantém a ordem salva; anexa ids novos (cards adicionados depois).
        const merged = [...saved.filter((id) => HOME_WIDGET_IDS.includes(id)), ...HOME_WIDGET_IDS.filter((id) => !saved.includes(id))];
        setOrdem(merged);
      }
    } catch { /* ignore */ }
    const onOpen = () => setDrawer(true);
    window.addEventListener("a4p:open-personalizar", onOpen);
    return () => window.removeEventListener("a4p:open-personalizar", onOpen);
  }, []);

  const persistVis = (v: Record<string, boolean>) => { setVisiveis(v); try { localStorage.setItem(KEY_VIS, JSON.stringify(v)); } catch { /* ignore */ } };
  const persistOrd = (o: string[]) => { setOrdem(o); try { localStorage.setItem(KEY_ORD, JSON.stringify(o)); } catch { /* ignore */ } };
  const persistAuto = (a: boolean) => { setAuto(a); try { localStorage.setItem(KEY_AUTO, a ? "1" : "0"); } catch { /* ignore */ } };
  const toggle = (id: string) => persistVis({ ...visiveis, [id]: visiveis[id] === false });
  const reset = () => { persistVis({}); persistOrd(HOME_WIDGET_IDS); persistAuto(true); };
  const on = (id: string) => visiveis[id] !== false;

  const algumVisivel = HOME_WIDGET_IDS.some(on);

  return (
    <div className="flex flex-col gap-6">
      <FirstRunCard />

      {hc.ordemBlocos.map((bloco) => {
        const ids = ordem.filter((id) => GRUPO_DE.get(id) === bloco && on(id));
        if (ids.length === 0) return null;
        const prioritario = auto && hc.topBloco === bloco;
        return (
          <section key={bloco} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <h2 className="m-0 text-label font-medium text-faint uppercase tracking-wide">{bloco}</h2>
              {prioritario && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-on-lime bg-lime rounded-pill px-2 py-[1px]">
                  <Icon name="trending-up" size={11} color="var(--color-on-lime)" />
                  Prioridade{hc.motivos[bloco] ? ` · ${hc.motivos[bloco]}` : ""}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
              {ids.map((id) => (
                <div key={id} className={CARD[id]?.full ? "md:col-span-2" : undefined}>
                  {CARD[id]?.node}
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {!algumVisivel && (
        <p className="text-caption text-faint text-center py-6">
          Nenhum bloco visível. Abra <b className="text-muted font-medium">Personalizar Home</b> no topo para reativar.
        </p>
      )}

      <HomeCustomizeDrawer
        open={drawer}
        visiveis={visiveis}
        ordem={ordem}
        auto={auto}
        setor={hc.setor}
        onToggle={toggle}
        onReorder={persistOrd}
        onAuto={persistAuto}
        onReset={reset}
        onClose={() => setDrawer(false)}
      />
    </div>
  );
}
