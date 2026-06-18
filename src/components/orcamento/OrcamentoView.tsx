"use client";

/**
 * Orçamento & Análise de Variância (Flux Analysis) — inspirado no orçado-vs-
 * realizado do Campfire. Por linha do resultado: orçado · realizado · desvio
 * (R$ e %) com drill-down para categorias e transações que explicam o desvio.
 * Orçamento mensal editável; sem ele, baseline automático (run-rate). Demo-safe.
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, BRL, StatusBadge, Button, Icon, CurrencyInput, Skeleton } from "@/components/ui";
import { getRiscoInput } from "@/lib/data";
import { periodoPreset } from "@/core/dre";
import type { Regime } from "@/core/dre/types";
import { analisarVariancia, type OrcamentoOverride, type LinhaOrcId, type LinhaVariancia } from "@/core/budget";
import { loadOrcamento, saveOrcamento } from "@/lib/budget";
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
const LINHAS_EDIT: { id: LinhaOrcId; label: string }[] = [
  { id: "receita", label: "Receita bruta" },
  { id: "impostos", label: "Impostos" },
  { id: "cmv", label: "CMV / Fornecedores" },
  { id: "folha", label: "Folha" },
  { id: "opex", label: "Despesas operacionais" },
  { id: "financeiro", label: "Resultado financeiro" },
];

const fmtDate = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y.slice(2)}`; };
const sinalTone = (s: LinhaVariancia["sinal"]): "positive" | "warning" | "neutral" =>
  s === "favoravel" ? "positive" : s === "desfavoravel" ? "warning" : "neutral";
const pctLabel = (l: LinhaVariancia) => `${l.varValor >= 0 ? "+" : "−"}${Math.abs(l.varPct * 100).toFixed(0)}%`;

export function OrcamentoVarianciaView() {
  const [preset, setPreset] = React.useState<Preset>("ytd");
  const [regime, setRegime] = React.useState<Regime>("competencia");
  const [override, setOverride] = React.useState<OrcamentoOverride>({});
  const [editando, setEditando] = React.useState(false);
  const [aberta, setAberta] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => { setOverride(loadOrcamento()); }, []);

  const q = useQuery({ queryKey: ["risco-input"], queryFn: getRiscoInput });
  const report = React.useMemo(() => {
    if (!q.data) return undefined;
    const f = periodoPreset(q.data.hoje, preset);
    return analisarVariancia(q.data, { regime, de: f.de, ate: f.ate, periodoLabel: f.periodoLabel }, override);
  }, [q.data, preset, regime, override]);

  const setLinha = (id: LinhaOrcId, v: number) => setOverride((o) => ({ ...o, [id]: v }));
  const salvar = () => { saveOrcamento(override); setEditando(false); };
  const limpar = () => { setOverride({}); saveOrcamento({}); };

  return (
    <AppShell title="Orçamento vs Realizado" crumb="Relatórios" actions={isDemo ? <DemoBadge /> : null}>
      {/* Controles período + regime */}
      <div className="flex items-center gap-4 flex-wrap mb-4">
        <div className="flex items-center gap-1 flex-wrap">
          {PRESETS.map((p) => (
            <button key={p.id} onClick={() => setPreset(p.id)}
              className={`text-caption font-medium rounded-pill px-3 py-1 ${preset === p.id ? "bg-ink text-white" : "bg-surface-2 text-muted hover:text-ink"}`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {(["competencia", "caixa"] as Regime[]).map((r) => (
            <button key={r} onClick={() => setRegime(r)}
              className={`text-caption font-medium rounded-pill px-3 py-1 ${regime === r ? "bg-ink text-white" : "bg-surface-2 text-muted hover:text-ink"}`}>
              {r === "caixa" ? "Caixa" : "Competência"}
            </button>
          ))}
        </div>
        <Button size="sm" variant="secondary" className="ml-auto" leftIcon={<Icon name="receipt" size={14} />} onClick={() => setEditando((e) => !e)}>
          {editando ? "Fechar orçamento" : "Editar orçamento"}
        </Button>
      </div>

      {q.isLoading || !report ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">{[0, 1, 2].map((i) => <Card key={i}><Skeleton className="h-16 w-full" /></Card>)}</div>
          <Card><Skeleton className="h-40 w-full" /></Card>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Editor de orçamento mensal */}
          {editando && (
            <Card className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="text-label font-medium text-muted">Orçamento mensal por linha</span>
                <span className="text-caption text-faint">Em branco = baseline automático (média da janela anterior).</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {LINHAS_EDIT.map((l) => (
                  <CurrencyInput key={l.id} label={l.label} value={override[l.id] ?? 0} onValueChange={(v) => setLinha(l.id, v)} />
                ))}
              </div>
              <div className="flex items-center gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={limpar}>Limpar (usar automático)</Button>
                <Button size="sm" onClick={salvar}>Salvar orçamento</Button>
              </div>
            </Card>
          )}

          {/* Resumo: Receita · EBITDA · Lucro (orçado vs realizado) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <ResumoCard titulo="Receita" orcado={report.resumo.receitaOrcado} realizado={report.resumo.receitaRealizado} maiorEhBom />
            <ResumoCard titulo="EBITDA" orcado={report.resumo.ebitdaOrcado} realizado={report.resumo.ebitdaRealizado} maiorEhBom />
            <ResumoCard titulo="Lucro líquido" orcado={report.resumo.lucroOrcado} realizado={report.resumo.lucroRealizado} maiorEhBom />
          </div>

          {/* Narrativa (flux analysis) */}
          <Card className="flex flex-col gap-2">
            <span className="text-label font-medium text-muted inline-flex items-center gap-2">
              <Icon name="sparkles" size={15} color="var(--color-lime)" /> Análise de variação
            </span>
            {report.narrativa.map((n, i) => (
              <span key={i} className="flex items-start gap-[6px] text-caption text-muted">
                <span className="w-[6px] h-[6px] rounded-pill bg-ink mt-[7px] shrink-0" />{n}
              </span>
            ))}
          </Card>

          {/* Tabela orçado × realizado por linha + drill-down */}
          <Card padded={false}>
            <div className="hidden sm:flex items-center gap-3 px-5 py-2 text-caption font-medium text-muted border-b border-border-soft">
              <span className="flex-1">Linha · {report.periodoLabel}</span>
              <span className="w-[120px] text-right">Orçado</span>
              <span className="w-[120px] text-right">Realizado</span>
              <span className="w-[110px] text-right">Desvio</span>
              <span className="w-[92px] text-right">%</span>
            </div>
            {report.linhas.map((l, i) => {
              const on = aberta[l.id];
              return (
                <div key={l.id} className={i ? "border-t border-border-soft" : ""}>
                  <button
                    onClick={() => setAberta((a) => ({ ...a, [l.id]: !a[l.id] }))}
                    className="w-full flex items-center gap-3 px-3 sm:px-5 py-3 text-left hover:bg-surface-1"
                  >
                    <Icon name={on ? "chevron-down" : "chevron-right"} size={15} color="var(--color-text-tertiary)" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[16px] font-medium text-ink truncate">{l.label}</div>
                      <div className="text-caption text-faint sm:hidden tabular-nums mt-[1px]">
                        orç. <BRL value={l.orcado} /> · real. <BRL value={l.realizado} />
                      </div>
                      {l.origemOrcado === "auto" && <span className="hidden sm:inline text-[11px] text-faint bg-surface-2 rounded-pill px-[6px] py-[1px]">auto</span>}
                    </div>
                    <span className="hidden sm:block w-[120px] text-right tabular-nums text-muted"><BRL value={l.orcado} /></span>
                    <span className="hidden sm:block w-[120px] text-right tabular-nums text-ink"><BRL value={l.realizado} /></span>
                    <span className="w-[110px] text-right shrink-0">
                      <StatusBadge tone={sinalTone(l.sinal)}>{l.varValor >= 0 ? "+" : "−"}{Math.abs(Math.round(l.varValor)).toLocaleString("pt-BR")}</StatusBadge>
                    </span>
                    <span className={`hidden sm:block w-[92px] text-right tabular-nums font-medium ${l.sinal === "favoravel" ? "text-positive" : l.sinal === "desfavoravel" ? "text-negative" : "text-muted"}`}>
                      {pctLabel(l)}
                    </span>
                  </button>

                  {on && (
                    <div className="px-3 sm:px-12 pb-4 pt-1 flex flex-col gap-3 bg-surface-1/40">
                      {l.drivers.length > 0 && (
                        <div>
                          <div className="text-caption font-medium text-faint mb-1">Categorias que mais pesam</div>
                          <div className="flex flex-col gap-1">
                            {l.drivers.map((d, k) => (
                              <div key={k} className="flex items-center justify-between gap-3 text-caption">
                                <span className="text-muted truncate">{d.categoria}</span>
                                <span className="tabular-nums text-ink shrink-0"><BRL value={d.valor} /></span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {l.transacoes.length > 0 && (
                        <div>
                          <div className="text-caption font-medium text-faint mb-1">Maiores transações do período</div>
                          <div className="flex flex-col gap-1">
                            {l.transacoes.map((t, k) => (
                              <div key={k} className="flex items-center justify-between gap-3 text-caption">
                                <span className="text-muted truncate">{fmtDate(t.data)} · {t.categoria}</span>
                                <span className="tabular-nums text-ink shrink-0"><BRL value={t.valor} /></span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {l.drivers.length === 0 && <span className="text-caption text-faint">Sem movimentos nesta linha no período.</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
        </div>
      )}
    </AppShell>
  );
}

function ResumoCard({ titulo, orcado, realizado, maiorEhBom }: { titulo: string; orcado: number; realizado: number; maiorEhBom: boolean }) {
  const delta = realizado - orcado;
  const bom = maiorEhBom ? delta >= 0 : delta <= 0;
  const tone = Math.abs(delta) < 1 ? "text-muted" : bom ? "text-positive" : "text-negative";
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-label font-medium text-muted">{titulo}</span>
      <span className="text-[28px] leading-none font-semibold text-ink tabular-nums"><BRL value={realizado} /></span>
      <span className="text-caption text-faint tabular-nums">orçado <BRL value={orcado} /></span>
      <span className={`text-caption font-medium tabular-nums ${tone}`}>
        {delta >= 0 ? "+" : "−"}<span className="tabular-nums">R$ {Math.abs(Math.round(delta)).toLocaleString("pt-BR")}</span> vs orçado
      </span>
    </Card>
  );
}
