"use client";

/**
 * Dashboard de Vendas — CAC · LTV · LTV/CAC · EBITDA · Receita · Reembolsos ·
 * Chargebacks.
 *
 * Aqui todo indicador é uma DERIVAÇÃO dos lançamentos, nunca um campo digitado.
 * Por isso cada card carrega o "i" com a fórmula exata: CAC e LTV mudam de
 * definição de empresa para empresa, e um número sem definição não serve para
 * decidir nada.
 */
import * as React from "react";
import {
  ResponsiveContainer, Line, BarChart, Bar, XAxis, YAxis, Tooltip, Area, ComposedChart,
} from "recharts";
import { Card, Skeleton } from "@/components/ui";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { chartAnim } from "@/lib/chart-anim";
import { painelVendas, rotuloMesAno, type FiltroPainel } from "@/core/paineis";
import {
  Subtitulo, MesPicker, FiltrosPainel, KpiSimples, KpiJanelas, TituloCard, VazioPainel, mesCorrente, tooltipPainel,
} from "./shared";

const brl0 = (n: number) => (n < 0 ? "−" : "") + "R$ " + Math.abs(Math.round(n)).toLocaleString("pt-BR");

export function VendasView() {
  const [mes, setMes] = React.useState(mesCorrente);
  const [filtro, setFiltro] = React.useState<FiltroPainel>({});
  const { data: input, isLoading } = useRiscoInput();

  const p = React.useMemo(() => (input ? painelVendas(input, mes, filtro) : null), [input, mes, filtro]);
  const rotulo = rotuloMesAno(mes);

  return (
    <div className="flex flex-col gap-5 pb-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <Subtitulo>CAC · LTV · LTV/CAC · EBITDA · Receita · Reembolsos · Chargebacks.</Subtitulo>
        <MesPicker mes={mes} onChange={setMes} />
      </div>

      <FiltrosPainel filtro={filtro} onChange={setFiltro} />

      {isLoading || !p ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((k) => <Card key={k}><Skeleton className="h-[120px]" /></Card>)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiJanelas
              label="CAC"
              linhas={[
                { nome: "Mês", valor: p.cac.mes },
                { nome: "Trimestre", valor: p.cac.trimestre },
                { nome: "Ano", valor: p.cac.ano },
              ]}
              info={{
                oQue: "Quanto custou conquistar um cliente novo. Se o CAC passa do LTV, cada venda nova custa mais do que devolve.",
                comoCalcula: "Gasto em marketing no período (categorias de marketing, anúncios, publicidade e tráfego) dividido pelo número de clientes NOVOS — aqueles cuja primeira receita da história caiu no período. Sem cliente novo no período o CAC fica em zero, porque dividir por zero seria inventar um número.",
              }}
            />
            <KpiJanelas
              label="LTV"
              linhas={[
                { nome: "Mês", valor: p.ltv.mes },
                { nome: "Trimestre", valor: p.ltv.trimestre },
                { nome: "Ano", valor: p.ltv.ano },
              ]}
              info={{
                oQue: "Quanto o cliente médio deixou no período, já descontado o custo médio de servir.",
                comoCalcula: "Receita liquidada do período dividida pelos clientes que pagaram, multiplicada pela margem do mesmo período (receita − despesa ÷ receita). É a medida do PERÍODO, não uma projeção de vida inteira — essa exigiria um churn confiável que a base ainda não tem.",
              }}
            />
            <KpiJanelas
              label="LTV / CAC"
              linhas={[
                // Sem gasto de aquisição a razão não existe (divisão por zero).
                { nome: "Mês", valor: p.cac.mes > 0 ? p.ltvSobreCac.mes : null, formato: "razao" },
                { nome: "Trimestre", valor: p.cac.trimestre > 0 ? p.ltvSobreCac.trimestre : null, formato: "razao" },
                { nome: "Ano", valor: p.cac.ano > 0 ? p.ltvSobreCac.ano : null, formato: "razao" },
              ]}
              info={{
                oQue: "Quantas vezes o cliente devolve o que custou trazê-lo. Abaixo de 1 a aquisição destrói caixa; a referência de mercado é 3.",
                comoCalcula: "LTV do período dividido pelo CAC do mesmo período. Fica em zero quando não houve gasto de aquisição no período.",
              }}
            />
            <KpiJanelas
              label="EBITDA"
              linhas={[
                { nome: "Mês", valor: p.ebitdaMes },
                { nome: "Ano", valor: p.ebitdaAno },
                { nome: "% receita", valor: p.ebitdaPctReceita, formato: "pct" },
              ]}
              info={{
                oQue: "O resultado da operação antes de juros, impostos sobre lucro, depreciação e amortização — o que o negócio gera antes da estrutura financeira.",
                comoCalcula: "Vem do MESMO motor do DRE (receita bruta − impostos sobre receita − CMV − despesas operacionais), sobre os lançamentos liquidados do período. Não é uma conta paralela: se mudar no DRE, muda aqui.",
              }}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiSimples
              label="Faturamento bruto"
              valor={p.faturamentoMes}
              rodape={`${rotulo} · ${p.clientesAtivos} ${p.clientesAtivos === 1 ? "cliente" : "clientes"} · ${p.clientesNovos} ${p.clientesNovos === 1 ? "novo" : "novos"}`}
              info={{
                oQue: "Tudo que entrou de receita no mês, antes de qualquer dedução.",
                comoCalcula: "Soma das entradas liquidadas no mês, pela data de pagamento.",
              }}
            />
            <KpiSimples
              label="Reembolsos"
              valor={p.reembolsos.mes}
              tom={p.reembolsos.mes > 0 ? "atencao" : "neutro"}
              rodape={<>No ano: {brl0(p.reembolsos.ano)}</>}
              info={{
                oQue: "Dinheiro devolvido — a venda aconteceu e voltou pelo caixa.",
                comoCalcula: "Saídas liquidadas cuja categoria fala em reembolso ou estorno, no mês e no ano.",
              }}
            />
            <KpiSimples
              label="Chargebacks"
              valor={p.chargebacks.mes}
              tom={p.chargebacks.mes > 0 ? "negativo" : "neutro"}
              rodape={<>No ano: {brl0(p.chargebacks.ano)}</>}
              info={{
                oQue: "Venda contestada que voltou atrás — o pior tipo de perda, porque leva junto o custo de servir.",
                comoCalcula: "Entradas CANCELADAS no período. É a marca que uma venda desfeita deixa no sistema; quando houver integração com a adquirente, a origem passa a ser o retorno dela.",
              }}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <TituloCard
                sub="Últimos 7 dias"
                info={{
                  oQue: "O ritmo recente de vendas, dia a dia.",
                  comoCalcula: "Entradas liquidadas em cada um dos 7 dias que terminam em hoje (ou no fim do mês, quando você navega para um mês passado).",
                }}
              >
                Vendas da semana
              </TituloCard>
              {p.vendasDaSemana.every((d) => d.valor === 0) ? (
                <VazioPainel texto="Nenhuma venda liquidada nos últimos 7 dias." />
              ) : (
                <div className="h-[220px] -ml-2" role="img" aria-label="Vendas dos últimos 7 dias">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={p.vendasDaSemana} margin={{ top: 6, right: 8, bottom: 0, left: 8 }}>
                      <XAxis dataKey="label" tickLine={false} axisLine={false}
                        tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} />
                      <YAxis tickLine={false} axisLine={false} width={54} interval={0}
                        tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
                        tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)))} />
                      <Tooltip formatter={(v: number) => brl0(v)} cursor={{ fill: "var(--color-surface-2)" }} contentStyle={tooltipPainel} />
                      <Bar dataKey="valor" fill="var(--color-lime)" radius={[4, 4, 0, 0]} {...chartAnim()} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card>
              <TituloCard
                sub={mes.slice(0, 4)}
                info={{
                  oQue: "A curva do ano — onde a receita cresceu e onde afundou.",
                  comoCalcula: "Entradas liquidadas em cada mês do ano selecionado, pela data de pagamento.",
                }}
              >
                Vendas do ano
              </TituloCard>
              {p.vendasDoAno.every((d) => d.valor === 0) ? (
                <VazioPainel texto="Nenhuma venda liquidada neste ano." />
              ) : (
                <div className="h-[220px] -ml-2" role="img" aria-label="Vendas mês a mês no ano">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={p.vendasDoAno} margin={{ top: 6, right: 8, bottom: 0, left: 8 }}>
                      <defs>
                        <linearGradient id="grad-vendas-ano" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--color-lime)" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="var(--color-lime)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd"
                        tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} />
                      <YAxis tickLine={false} axisLine={false} width={54}
                        tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
                        tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)))} />
                      <Tooltip formatter={(v: number) => brl0(v)} contentStyle={tooltipPainel} />
                      <Area type="monotone" dataKey="valor" stroke="none" fill="url(#grad-vendas-ano)" {...chartAnim()} />
                      <Line type="monotone" dataKey="valor" stroke="var(--color-lime)" strokeWidth={1.4} dot={false}
                        activeDot={{ r: 4 }} {...chartAnim(120)} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
