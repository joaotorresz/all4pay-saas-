"use client";

/**
 * Plano de contratações (`/contratacoes`) — headcount planning × runway
 * (benchmark Runway.com). O fundador monta o plano (cargo, salário, mês de
 * início, quantidade); o motor `core/headcount` aplica o CUSTO REAL de folha
 * (salário + 13º + férias+1/3 + FGTS via `core/payroll`) e projeta caixa mês
 * a mês, runway e score antes/depois. Demo-safe (só leitura dos motores).
 */
import * as React from "react";
import { AppShell } from "@/components/app/AppShell";
import { Card, BRL, Button, Icon, Input, CurrencyInput, Select, Skeleton } from "@/components/ui";
import { useQuantitativo, useRiscoInput } from "@/components/visao-geral/hooks";
import { planejarContratacoes, custoMensalContratacao, type Contratacao } from "@/core/headcount";
import { EmptyState, IconTile } from "@/components/visao-geral/shared";

const MESES_OPT = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `Mês ${i + 1}` }));

export function HeadcountView() {
  const { data: q, isLoading, isError } = useQuantitativo();
  const { data: input } = useRiscoInput();
  const [plano, setPlano] = React.useState<Contratacao[]>([
    { id: "c1", cargo: "Engenheiro(a)", salario: 0, quantidade: 1, mesInicio: 1 },
  ]);

  const resultado = React.useMemo(() => {
    if (!q || !input) return null;
    return planejarContratacoes(q.indicadores, input.saldoAtual, q.score.score, plano);
  }, [q, input, plano]);

  const setLinha = (id: string, patch: Partial<Contratacao>) =>
    setPlano((p) => p.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const addLinha = () =>
    setPlano((p) => [...p, { id: `c${Date.now()}`, cargo: "", salario: 0, quantidade: 1, mesInicio: 1 }]);
  const rmLinha = (id: string) => setPlano((p) => p.filter((c) => c.id !== id));

  return (
    <AppShell title="Plano de contratações">
      <div className="flex flex-col gap-5 pb-8">
        {isLoading && <Skeleton className="h-[120px] w-full" rounded="md" />}
        {isError && <Card><EmptyState title="Não foi possível carregar os indicadores" /></Card>}
        {q && input && resultado && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            {/* Plano */}
            <Card className="flex flex-col gap-4" info={{
              titulo: "Plano de contratações",
              oQue: "Monte o plano de vagas e veja o impacto real no caixa antes de contratar.",
              comoCalcula: "Cada vaga entra com o custo REAL de folha (salário + 13º + férias com 1/3 + FGTS, ~1,36× o salário) a partir do mês de início. O motor projeta o caixa mês a mês e recalcula runway e score.",
            }}>
              <div className="flex items-center gap-3">
                <IconTile name="users" />
                <div>
                  <h2 className="m-0 text-h3 font-medium text-ink">Vagas do plano</h2>
                  <span className="text-caption text-faint">salário + encargos reais (13º · férias+1/3 · FGTS)</span>
                </div>
              </div>

              {plano.map((c) => (
                <div key={c.id} className="rounded-md bg-surface-2 p-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Input value={c.cargo} onChange={(e) => setLinha(c.id, { cargo: e.target.value })} placeholder="Cargo (ex.: Engenheiro)" containerClassName="flex-1" />
                    <button onClick={() => rmLinha(c.id)} aria-label="Remover vaga" className="w-8 h-8 rounded-md inline-flex items-center justify-center text-faint hover:text-negative hover:bg-white shrink-0">
                      <Icon name="trash-2" size={15} color="currentColor" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <CurrencyInput label="Salário/mês" value={c.salario} onValueChange={(v) => setLinha(c.id, { salario: v })} />
                    <Input label="Qtd." type="number" min={1} value={String(c.quantidade)} onChange={(e) => setLinha(c.id, { quantidade: Math.max(1, Number(e.target.value) || 1) })} />
                    <Select label="Início" value={String(c.mesInicio)} onChange={(v) => setLinha(c.id, { mesInicio: Number(v) })} options={MESES_OPT} />
                  </div>
                  {c.salario > 0 && (
                    <span className="text-caption text-faint">
                      custo real: <b className="text-muted font-medium tabular-nums"><BRL value={custoMensalContratacao(c.salario) * c.quantidade} /></b>/mês com encargos
                    </span>
                  )}
                </div>
              ))}
              <Button variant="secondary" size="sm" onClick={addLinha}>
                <Icon name="plus" size={14} color="currentColor" /> Adicionar vaga
              </Button>
            </Card>

            {/* Impacto */}
            <Card className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <IconTile name="gauge" />
                <div>
                  <h2 className="m-0 text-h3 font-medium text-ink">Impacto no caixa</h2>
                  <span className="text-caption text-faint">{resultado.pessoas} contratação(ões) · {resultado.versaoModelo}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Kpi label="Custo do plano / mês" v={<BRL value={resultado.custoMensalPlano} />} />
                <Kpi label="Custo no 1º ano" v={<BRL value={resultado.custoAnualPlano} />} />
                <Kpi label="Runway" v={<>{resultado.antes.runwayMeses.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} → <b className={resultado.depois.runwayMeses < resultado.antes.runwayMeses ? "text-warning" : "text-positive"}>{resultado.depois.runwayMeses.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</b> meses</>} />
                <Kpi label="Score de saúde" v={<>{resultado.antes.score} → <b className={resultado.depois.scoreProjetado < resultado.antes.score ? "text-warning" : "text-positive"}>{resultado.depois.scoreProjetado}</b>/100</>} />
              </div>

              <p className="m-0 text-caption leading-snug text-muted">{resultado.depois.texto}</p>
              {resultado.mesAperto !== null && (
                <p className="m-0 text-caption font-medium text-negative">
                  Com este plano, o caixa projetado fica negativo no mês {resultado.mesAperto}.
                </p>
              )}

              <div className="flex flex-col gap-1">
                <span className="text-caption font-medium text-faint">Caixa projetado · 12 meses</span>
                <div className="grid grid-cols-6 gap-[6px]">
                  {resultado.serie.map((m) => (
                    <div key={m.mes} className="rounded-sm px-2 py-[6px] text-center bg-surface-2">
                      <div className="text-[11px] text-faint">M{m.mes}</div>
                      <div className={`text-[12px] font-medium tabular-nums ${m.caixa < 0 ? "text-negative" : "text-ink"}`}>
                        {Math.round(m.caixa / 1000).toLocaleString("pt-BR")}k
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Kpi({ label, v }: { label: string; v: React.ReactNode }) {
  return (
    <div className="rounded-md bg-surface-2 px-4 py-3">
      <div className="text-caption text-muted">{label}</div>
      <div className="text-h3 font-semibold tabular-nums text-ink mt-1">{v}</div>
    </div>
  );
}
