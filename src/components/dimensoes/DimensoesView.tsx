"use client";

/**
 * Dimensões & Tags — pivota os movimentos por categoria, centro de custo,
 * contraparte ou tag customizada, com drill-down até a transação. Permite
 * marcar tags por transação (cria dimensões customizadas). Inspirado nas
 * dimensões ilimitadas + drill-down do Campfire. Demo-safe.
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, BRL, Button, Icon, Skeleton } from "@/components/ui";
import { getRiscoInput } from "@/lib/data";
import { periodoPreset } from "@/core/dre";
import type { Regime } from "@/core/dre/types";
import { analisarDimensao, DIMENSOES, type Dimensao } from "@/core/dimensions";
import { loadTags, hydrateTags, addTag, removeTag } from "@/lib/tags";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { AppShell } from "@/components/app/AppShell";

type Preset = "mes" | "mes_anterior" | "ytd" | "12m";
const PRESETS: { id: Preset; label: string }[] = [
  { id: "mes", label: "Mês atual" },
  { id: "mes_anterior", label: "Mês anterior" },
  { id: "ytd", label: "YTD" },
  { id: "12m", label: "12 meses" },
];
const fmtDate = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y.slice(2)}`; };

export function DimensoesView() {
  const [dim, setDim] = React.useState<Dimensao>("categoria");
  const [preset, setPreset] = React.useState<Preset>("ytd");
  const [regime, setRegime] = React.useState<Regime>("competencia");
  const [tags, setTags] = React.useState(() => ({} as ReturnType<typeof loadTags>));
  const [aberta, setAberta] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => { hydrateTags().then(setTags).catch(() => setTags({})); }, []);

  const q = useQuery({ queryKey: ["risco-input"], queryFn: getRiscoInput });
  const report = React.useMemo(() => {
    if (!q.data) return undefined;
    const f = periodoPreset(q.data.hoje, preset);
    return analisarDimensao(q.data, { dim, regime, de: f.de, ate: f.ate, periodoLabel: f.periodoLabel }, tags);
  }, [q.data, dim, preset, regime, tags]);

  const marcar = async (id: string) => {
    const t = window.prompt("Nova tag para esta transação:");
    if (t && t.trim()) setTags({ ...(await addTag(id, t.trim())) });
  };
  const desmarcar = async (id: string, t: string) => setTags({ ...(await removeTag(id, t)) });

  return (
    <AppShell title="Dimensões & Tags" crumb="Relatórios" actions={isDemo ? <DemoBadge /> : null}>
      {/* Controles */}
      <div className="flex items-center gap-4 flex-wrap mb-4">
        <div className="flex items-center gap-1 flex-wrap">
          {DIMENSOES.map((d) => (
            <button key={d.id} onClick={() => setDim(d.id)}
              className={`text-caption font-medium rounded-pill px-3 py-1 ${dim === d.id ? "bg-ink text-white" : "bg-surface-2 text-muted hover:text-ink"}`}>
              {d.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 flex-wrap ml-auto">
          {PRESETS.map((p) => (
            <button key={p.id} onClick={() => setPreset(p.id)}
              className={`text-caption font-medium rounded-pill px-3 py-1 ${preset === p.id ? "bg-ink text-white" : "bg-surface-2 text-muted hover:text-ink"}`}>
              {p.label}
            </button>
          ))}
          {(["competencia", "caixa"] as Regime[]).map((r) => (
            <button key={r} onClick={() => setRegime(r)}
              className={`text-caption font-medium rounded-pill px-3 py-1 ${regime === r ? "bg-ink text-white" : "bg-surface-2 text-muted hover:text-ink"}`}>
              {r === "caixa" ? "Caixa" : "Competência"}
            </button>
          ))}
        </div>
      </div>

      {q.isLoading || !report ? (
        <Card><Skeleton className="h-40 w-full" /></Card>
      ) : report.linhas.length === 0 ? (
        <Card><span className="text-caption text-faint">Nenhum movimento no período.</span></Card>
      ) : (
        <Card padded={false} info={{ titulo: "Análise por dimensão", oQue: "Agrupa os movimentos pela dimensão escolhida (categoria, centro de custo, contraparte ou tag) com drill-down até a transação.", comoCalcula: "Soma receita e despesa de cada grupo no período e regime; resultado igual a receita menos despesa." }}>
          <div className="hidden sm:flex items-center gap-3 px-5 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-faint border-b border-border-soft">
            <span className="flex-1">{DIMENSOES.find((d) => d.id === dim)?.label} · {report.periodoLabel}</span>
            <span className="w-[120px] text-right">Receita</span>
            <span className="w-[120px] text-right">Despesa</span>
            <span className="w-[120px] text-right">Resultado</span>
          </div>
          {report.linhas.map((l, i) => {
            const on = aberta[l.chave];
            return (
              <div key={l.chave} className={i ? "border-t border-border-soft" : ""}>
                <button onClick={() => setAberta((a) => ({ ...a, [l.chave]: !a[l.chave] }))}
                  className="w-full flex items-center gap-3 px-3 sm:px-5 py-3 text-left hover:bg-surface-1">
                  <Icon name={on ? "chevron-down" : "chevron-right"} size={15} color="var(--color-text-tertiary)" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[16px] font-medium text-ink truncate">{l.chave}</div>
                    <div className="text-caption text-faint">{l.n} lançamento(s)
                      <span className="sm:hidden tabular-nums"> · resultado <BRL value={l.resultado} /></span>
                    </div>
                  </div>
                  <span className="hidden sm:block w-[120px] text-right tabular-nums text-positive"><BRL value={l.receita} /></span>
                  <span className="hidden sm:block w-[120px] text-right tabular-nums text-muted"><BRL value={l.despesa} /></span>
                  <span className={`hidden sm:block w-[120px] text-right tabular-nums font-medium ${l.resultado >= 0 ? "text-ink" : "text-negative"}`}><BRL value={l.resultado} /></span>
                </button>
                {on && (
                  <div className="px-3 sm:px-12 pb-4 pt-1 flex flex-col gap-1 bg-surface-1/40">
                    {l.transacoes.map((t) => (
                      <div key={t.id} className="flex items-center justify-between gap-3 py-2 border-t border-border-soft first:border-t-0 text-caption">
                        <div className="min-w-0 flex-1">
                          <span className="text-muted">{fmtDate(t.data)} · {t.rotulo}</span>
                          <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                            {(tags[t.id] ?? []).map((tg) => (
                              <span key={tg} className="inline-flex items-center gap-1 text-[11px] text-ink bg-surface-2 rounded-pill px-[7px] py-[1px]">
                                {tg}
                                <button onClick={() => desmarcar(t.id, tg)} aria-label={`Remover ${tg}`} className="text-faint hover:text-negative">×</button>
                              </span>
                            ))}
                            <button onClick={() => marcar(t.id)} className="text-[11px] text-muted hover:text-ink inline-flex items-center gap-[2px]">
                              <Icon name="plus" size={11} color="var(--color-lime)" /> tag
                            </button>
                          </span>
                        </div>
                        <span className={`tabular-nums shrink-0 ${t.tipo === "saida" ? "text-negative" : "text-ink"}`}><BRL value={t.valor} /></span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <div className="flex items-center gap-3 px-5 py-3 border-t border-border-soft text-caption font-medium">
            <span className="flex-1 text-muted">Total</span>
            <span className="hidden sm:block w-[120px] text-right tabular-nums text-positive"><BRL value={report.totalReceita} /></span>
            <span className="hidden sm:block w-[120px] text-right tabular-nums text-muted"><BRL value={report.totalDespesa} /></span>
            <span className="hidden sm:block w-[120px] text-right tabular-nums text-ink"><BRL value={report.totalReceita - report.totalDespesa} /></span>
          </div>
        </Card>
      )}
    </AppShell>
  );
}
