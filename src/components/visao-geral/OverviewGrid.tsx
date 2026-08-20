"use client";

import * as React from "react";
import { ReceivablesCard } from "./ReceivablesCard";
import { PayablesCard } from "./PayablesCard";
import { DailyCashflowChart } from "./DailyCashflowChart";
import { TransactionsCalendar } from "./TransactionsCalendar";
import { FirstRunCard } from "./FirstRunCard";
import { CompleteCadastro } from "@/components/entrada/CompleteCadastro";
import { HomeCustomizeDrawer, HOME_WIDGETS, HOME_WIDGET_IDS, DEFAULT_WIDGET_IDS } from "./HomeCustomizeDrawer";
import { useHomeContext } from "./homeContext";
import { Icon } from "@/components/ui";
import { TransacoesRecentesCard } from "./HomeCards";
import { useCockpitCtx, CATALOG_BY_ID, type CockpitCtx } from "./cockpit";
import { UploadWizard } from "@/components/upload/UploadWizard";
import { JornadaCard } from "@/components/comece/Jornada";

const KEY_VIS = "a4p_home_widgets";
const KEY_ORD = "a4p_home_order";
const KEY_AUTO = "a4p_home_auto";

/** Cards "bespoke" (curados) — id → componente + se ocupa a linha inteira. */
const BESPOKE: Record<string, { node: React.ReactNode; full?: boolean }> = {
  cashflow: { node: <DailyCashflowChart />, full: true },
  calendar: { node: <TransactionsCalendar />, full: true },
  receivables: { node: <ReceivablesCard /> },
  payables: { node: <PayablesCard /> },
  ultimosGastos: { node: <TransacoesRecentesCard />, full: true },
};
const GRUPO_DE = new Map(HOME_WIDGETS.map((w) => [w.id, w.grupo]));
/** Ordem fixa dentro do bloco Caixa: Fluxo de caixa · Calendário · resto. */
const CAIXA_PRIO = ["cashflow", "calendar"];
const caixaRank = (id: string) => { const i = CAIXA_PRIO.indexOf(id); return i < 0 ? 99 : i; };

/** Resolve o nó e a largura de qualquer widget (curado, "Hoje" ou catálogo). */
function widgetNode(id: string, ctx: CockpitCtx): { node: React.ReactNode; full: boolean } {
  const b = BESPOKE[id];
  if (b) return { node: b.node, full: !!b.full };
  const cat = CATALOG_BY_ID.get(id);
  if (cat) return { node: cat.render(ctx), full: false };
  return { node: null, full: false };
}

export function OverviewGrid() {
  const [visiveis, setVisiveis] = React.useState<Record<string, boolean>>({});
  const [ordem, setOrdem] = React.useState<string[]>(HOME_WIDGET_IDS);
  const [auto, setAuto] = React.useState(true);
  const [drawer, setDrawer] = React.useState(false);
  const hc = useHomeContext(auto);
  const ctx = useCockpitCtx();

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
  // Visibilidade por widget: respeita a escolha do usuário (Personalizar Home)
  // nos dois modos; sem escolha, usa o default (curados ligados, catálogo off).
  const on = (id: string) => visiveis[id] ?? DEFAULT_WIDGET_IDS.has(id);
  const toggle = (id: string) => persistVis({ ...visiveis, [id]: !on(id) });
  const reset = () => { persistVis({}); persistOrd(HOME_WIDGET_IDS); persistAuto(true); };

  const algumVisivel = HOME_WIDGET_IDS.some(on);

  return (
    <div className="flex flex-col gap-9">
      {/* ⚠️ ANTES do FirstRun e da Jornada: o cadastro de três campos deixa o
          regime tributário em aberto, e ele é o único item que muda CÁLCULO.
          Enquanto faltar, todo número de imposto e de folha sai pelo cenário
          mais caro — e o cartão some sozinho quando não há mais o que pedir. */}
      <CompleteCadastro />
      <FirstRunCard />
      <JornadaCard />

      {hc.ordemBlocos.map((bloco) => {
        const idsRaw = ordem.filter((id) => GRUPO_DE.get(id) === bloco && on(id));
        // Caixa é fixo no topo com Fluxo de caixa + Velas primeiro (pedido do usuário).
        const ids = bloco === "Caixa"
          ? [...idsRaw].sort((a, b) => caixaRank(a) - caixaRank(b))
          : idsRaw;
        if (ids.length === 0) return null;
        const prioritario = auto && hc.topBloco === bloco;
        return (
          <section key={bloco} className="flex flex-col gap-3">
            <div className="flex items-center gap-2" data-block-header>
              <h2 className="m-0 text-label font-medium text-faint tracking-wide">{bloco}</h2>
              {prioritario && (
                <span className="inline-flex items-center gap-1 text-[13px] font-medium text-on-lime bg-lime rounded-pill px-2 py-[1px]">
                  <Icon name="trending-up" size={11} color="var(--color-on-lime)" />
                  Prioridade{hc.motivos[bloco] ? ` · ${hc.motivos[bloco]}` : ""}
                </span>
              )}
            </div>
            {bloco === "Caixa" ? (
              // Fluxo de caixa e Calendário lado a lado, mesma largura (simétrico).
              <div className="grid grid-cols-1 md:grid-cols-10 gap-5 items-stretch">
                {ids.map((id) => {
                  const w = widgetNode(id, ctx);
                  const span = id === "cashflow" || id === "calendar" ? "md:col-span-5" : "md:col-span-10";
                  return <div key={id} className={`${span} flex [&>*]:w-full`}>{w.node}</div>;
                })}
              </div>
            ) : bloco === "Operação" ? (
              // A receber · A pagar · Pendências dividem a MESMA linha em 3 (1/3
              // cada); Hoje/Saldo·contas ocupam a largura toda.
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
                {ids.map((id) => {
                  const w = widgetNode(id, ctx);
                  const trio = id === "receivables" || id === "payables" || id === "pendencias";
                  return (
                    <div key={id} className={trio ? "flex [&>*]:w-full" : "md:col-span-3"}>
                      {w.node}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
                {ids.map((id) => {
                  const w = widgetNode(id, ctx);
                  return (
                    <div key={id} className={w.full ? "md:col-span-2" : undefined}>
                      {w.node}
                    </div>
                  );
                })}
              </div>
            )}
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


      <UploadWizard />
    </div>
  );
}
