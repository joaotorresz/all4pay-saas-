"use client";

/**
 * Dash de Contas a Pagar / a Receber — a MESMA tela em duas direções.
 *
 * Pagar e receber são o mesmo problema espelhado (um título, um vencimento, um
 * status), então são um componente só com `direcao`. Duplicar o arquivo daria
 * duas telas que envelhecem separado — foi exatamente o entulho que a limpeza
 * do sistema removeu.
 */
import * as React from "react";
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, Legend,
} from "recharts";
import { Card, Skeleton, DateField, BRL, Button, Icon } from "@/components/ui";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { chartAnim } from "@/lib/chart-anim";
import { painelTitulos, fimDoMes, type FiltroPainel, type StatusTitulo } from "@/core/paineis";
import {
  Subtitulo, FiltrosPainel, KpiStatus, TituloCard, VazioPainel, tooltipPainel, type TomKpi,
} from "./shared";
import { pctDeInteiro } from "@/lib/format";

const brl0 = (n: number) => (n < 0 ? "−" : "") + "R$ " + Math.abs(Math.round(n)).toLocaleString("pt-BR");

const TOM: Record<StatusTitulo, TomKpi> = { liquidado: "positivo", a_vencer: "atencao", atrasado: "negativo" };
const COR: Record<StatusTitulo, string> = {
  liquidado: "var(--color-positive)",
  a_vencer: "var(--color-warning)",
  atrasado: "var(--color-negative)",
};
/** A MESMA cor a 70% para as áreas grandes (donut, barras): cor de status é
 *  sinal semântico, e chapada num donut inteiro vira preenchimento. Os pontos
 *  da legenda e o fio dos cartões seguem na cor cheia. */
const FILL: Record<StatusTitulo, string> = {
  liquidado: "color-mix(in srgb, var(--color-positive) 70%, transparent)",
  a_vencer: "color-mix(in srgb, var(--color-warning) 70%, transparent)",
  atrasado: "color-mix(in srgb, var(--color-negative) 70%, transparent)",
};

/** Janela padrão: de hoje até o fim do mês — o horizonte que a operação olha. */
function janelaPadrao(hoje: string): { de: string; ate: string } {
  return { de: hoje, ate: fimDoMes(hoje.slice(0, 7)) };
}

export function TitulosView({ direcao }: { direcao: "pagar" | "receber" }) {
  const { data: input, isLoading } = useRiscoInput();
  const [janela, setJanela] = React.useState<{ de: string; ate: string } | null>(null);
  const [filtro, setFiltro] = React.useState<FiltroPainel>({});

  React.useEffect(() => { if (input && !janela) setJanela(janelaPadrao(input.hoje)); }, [input, janela]);

  const p = React.useMemo(
    () => (input && janela ? painelTitulos(input, direcao, janela.de, janela.ate, filtro) : null),
    [input, janela, direcao, filtro],
  );

  const liquidadoLabel = direcao === "pagar" ? "pago" : "recebido";

  return (
    <div className="flex flex-col gap-5 pb-4">
      <Subtitulo>
        Visão consolidada das contas a {direcao} no período — {liquidadoLabel}, a vencer e atrasado
        {direcao === "receber" ? " (inadimplência)" : ""}.
      </Subtitulo>

      {/* ------------------------------- filtros ------------------------------- */}
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-4 items-end">
          <div className="flex flex-col gap-[6px]">
            <label className="text-caption font-medium text-muted">Período (vencimento)</label>
            <div className="flex items-center gap-2 flex-wrap">
              <DateField value={janela?.de ?? ""} onChange={(v) => setJanela((j) => ({ de: v, ate: j?.ate ?? v }))} />
              <Icon name="arrow-up-right" size={14} color="var(--color-text-tertiary)" />
              <DateField value={janela?.ate ?? ""} onChange={(v) => setJanela((j) => ({ de: j?.de ?? v, ate: v }))} />
            </div>
          </div>
          <Button variant="ghost" onClick={() => input && setJanela(janelaPadrao(input.hoje))}>
            Restaurar período
          </Button>
        </div>
      </Card>

      <FiltrosPainel filtro={filtro} onChange={setFiltro} />

      {isLoading || !p ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((k) => <Card key={k}><Skeleton className="h-[100px]" /></Card>)}
        </div>
      ) : p.titulos === 0 ? (
        <Card>
          <VazioPainel texto={`Nenhum título a ${direcao} vence neste período. Ajuste as datas acima para olhar outra janela.`} />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiStatus
              label="Total geral do período"
              valor={p.total}
              titulos={p.titulos}
              info={{
                oQue: `Tudo que vence no período, independentemente de já ter sido ${liquidadoLabel}.`,
                comoCalcula: "Soma dos títulos cuja DATA DE VENCIMENTO cai na janela escolhida. É o vencimento que responde 'o que cai neste período' — um título pago fora da janela mas vencido dentro dela continua sendo do período.",
              }}
            />
            {p.grupos.map((g) => (
              <KpiStatus
                key={g.status}
                label={g.label}
                valor={g.total}
                titulos={g.titulos}
                pct={g.pct}
                tom={TOM[g.status]}
                info={{
                  oQue: g.status === "liquidado"
                    ? `O que já foi ${liquidadoLabel} dentro do período.`
                    : g.status === "a_vencer"
                      ? "O que ainda vai vencer — o compromisso que está por vir."
                      : `O que passou do vencimento e continua em aberto${direcao === "receber" ? " — a inadimplência da carteira" : ""}.`,
                  comoCalcula: g.status === "liquidado"
                    ? "Títulos do período com baixa registrada."
                    : g.status === "a_vencer"
                      ? "Títulos em aberto com vencimento de hoje em diante."
                      : "Títulos em aberto com vencimento anterior a hoje.",
                }}
              />
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* --------------------- distribuição por status --------------------- */}
            <Card>
              <TituloCard
                sub={`${p.grupos.map((g) => g.label).join(", ")} no período`}
                info={{
                  oQue: "A composição do período: quanto já se resolveu e quanto ainda pesa.",
                  comoCalcula: "Os mesmos títulos dos cartões acima, como fatia do total do período.",
                }}
              >
                Distribuição por status
              </TituloCard>
              <div className="h-[200px]" role="img" aria-label="Distribuição dos títulos por status">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={p.grupos.filter((g) => g.total > 0)} dataKey="total" nameKey="label"
                      innerRadius="58%" outerRadius="86%" stroke="none" {...chartAnim()}>
                      {p.grupos.filter((g) => g.total > 0).map((g) => <Cell key={g.status} fill={FILL[g.status]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => brl0(v)} contentStyle={tooltipPainel} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col mt-2">
                {p.grupos.map((g) => (
                  <div key={g.status} className="flex items-center gap-2 py-[6px] border-b border-border-soft last:border-0">
                    <span className="w-[9px] h-[9px] rounded-sm shrink-0" style={{ background: COR[g.status] }} />
                    <span className="text-label text-muted flex-1 truncate">{g.label}</span>
                    <span className="text-caption text-faint tabular-nums shrink-0">{pctDeInteiro(g.pct)}</span>
                    <span className="text-label text-ink tabular-nums shrink-0 w-[110px] text-right"><BRL value={g.total} /></span>
                  </div>
                ))}
              </div>
            </Card>

            {/* ---------------------- fluxo de vencimentos ---------------------- */}
            <Card>
              <TituloCard
                sub="Valores por data de vencimento"
                info={{
                  oQue: "Em que dias o dinheiro cai — onde estão os picos que apertam o caixa.",
                  comoCalcula: "Os títulos do período somados por data de vencimento, empilhados pelo status de cada um.",
                }}
              >
                Fluxo de vencimentos
              </TituloCard>
              <div className="h-[240px] -ml-2" role="img" aria-label="Valores por data de vencimento">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={p.vencimentos} margin={{ top: 6, right: 8, bottom: 0, left: 8 }}>
                    <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd"
                      tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} />
                    <YAxis tickLine={false} axisLine={false} width={54}
                      tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
                      tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)))} />
                    <Tooltip formatter={(v: number) => brl0(v)} cursor={{ fill: "var(--color-surface-2)" }} contentStyle={tooltipPainel} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="atrasado" name="Atrasado" stackId="v" fill={FILL.atrasado} {...chartAnim()} />
                    <Bar dataKey="aVencer" name="A vencer" stackId="v" fill={FILL.a_vencer} {...chartAnim(120)} />
                    <Bar dataKey="liquidado" name={p.grupos[0].label} stackId="v" fill={FILL.liquidado}
                      radius={[4, 4, 0, 0]} {...chartAnim(240)} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* ---------------------------- contrapartes ---------------------------- */}
          <Card>
            <TituloCard
              info={{
                oQue: direcao === "pagar"
                  ? "Para quem vai o dinheiro do período — onde está a concentração de fornecedores."
                  : "De quem vem o dinheiro do período — onde está a concentração de clientes.",
                comoCalcula: "Os títulos do período agrupados por contraparte, das oito maiores para as menores.",
              }}
            >
              Maiores contrapartes do período
            </TituloCard>
            <div className="flex flex-col">
              {p.contrapartes.map((c) => (
                <div key={c.nome} className="flex items-baseline justify-between gap-3 py-2 border-b border-border-soft last:border-0">
                  <span className="text-label text-ink truncate">
                    {c.nome}
                    <span className="text-caption text-faint"> · {c.titulos} {c.titulos === 1 ? "título" : "títulos"}</span>
                  </span>
                  <span className="text-label text-ink tabular-nums shrink-0"><BRL value={c.valor} /></span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
